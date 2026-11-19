import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import {
  APICallError,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
  generateText,
  streamText,
  type LanguageModel,
} from "ai";
import type { z } from "zod";
import { readAiConfig, type AiConfig } from "./config";

/** 모든 AI 호출의 시간 제한 */
export const AI_TIMEOUT_MS = 8_000;

export type AiFailureReason =
  | "missing_key"
  | "timeout"
  | "unauthorized"
  | "rate_limited"
  | "insufficient_credit"
  | "overloaded"
  | "refused"
  | "invalid_output"
  | "unavailable";

/** 사용자에게 보여줄 안내. 실패해도 판정과 고정 템플릿은 그대로 쓸 수 있다. */
export const AI_FAILURE_MESSAGES: Record<AiFailureReason, string> = {
  missing_key: "AI 기능이 아직 설정되지 않았어요. 기본 안내를 보여드릴게요.",
  timeout: "AI 응답이 늦어 기본 안내를 보여드릴게요.",
  unauthorized: "AI 서비스 인증에 실패했어요. 기본 안내를 보여드릴게요.",
  rate_limited: "AI 요청이 많아요. 잠시 후 다시 시도해 주세요.",
  insufficient_credit: "AI 사용 한도를 넘었어요. 기본 안내를 보여드릴게요.",
  overloaded: "AI 서비스가 붐비고 있어요. 잠시 후 다시 시도해 주세요.",
  refused: "이 내용은 AI가 답하지 않았어요. 기본 안내를 보여드릴게요.",
  invalid_output: "AI 응답 형식이 올바르지 않아 기본 안내를 보여드릴게요.",
  unavailable: "AI 응답을 받지 못했어요. 기본 안내를 보여드릴게요.",
};

export type AiResult<T> =
  | { ok: true; data: T; model: string }
  | { ok: false; reason: AiFailureReason; message: string };

export type AiTask<T> = {
  system: string;
  prompt: string;
  /** 응답 형식. 통과하지 못한 응답은 쓰지 않는다. */
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  /** 스키마 다음에 거는 내용 검사. false면 invalid_output으로 처리한다. */
  validate?: (data: T) => boolean;
};

export type AiGenerateArgs = {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<unknown>;
  maxOutputTokens: number;
  abortSignal: AbortSignal;
};

/** 모델 호출 한 번. 테스트에서는 이 함수를 모의로 바꾼다. */
export type AiGenerate = (args: AiGenerateArgs) => Promise<{ output: unknown; finishReason: string }>;

type ModelFactory = (apiKey: string, model: string) => LanguageModel;

const anthropicModel: ModelFactory = (apiKey, model) => createAnthropic({ apiKey })(model);

const ANTHROPIC_OPTIONS = {
  // 거절되면 Anthropic이 같은 요청을 대체 모델로 다시 처리한다.
  anthropic: { effort: "low", fallbacks: "default" },
} as const;

/** AI SDK로 구조화된 응답을 받는다. 모델 팩토리를 바꾸면 네트워크 없이 시험할 수 있다. */
export function createGenerate(modelFactory: ModelFactory = anthropicModel): AiGenerate {
  return async ({ apiKey, model, system, prompt, schema, maxOutputTokens, abortSignal }) => {
    const result = await generateText({
      model: modelFactory(apiKey, model),
      system,
      prompt,
      output: Output.object({ schema }),
      maxOutputTokens,
      // 재시도하면 8초 안에 끝나지 않으므로 한 번만 시도한다.
      maxRetries: 0,
      abortSignal,
      providerOptions: ANTHROPIC_OPTIONS,
    });
    if (result.finishReason === "content-filter") {
      return { output: undefined, finishReason: result.finishReason };
    }
    return { output: result.output, finishReason: result.finishReason };
  };
}

function isCreditError(error: APICallError): boolean {
  const text = `${error.message} ${error.responseBody ?? ""}`;
  return error.statusCode === 402 || /credit balance|billing/i.test(text);
}

/** 어떤 오류든 실패 사유 하나로 바꾼다. */
export function classifyAiError(error: unknown): AiFailureReason {
  // 재시도 끝에 실패하면 마지막 오류를 기준으로 본다.
  if (RetryError.isInstance(error)) return classifyAiError(error.lastError);
  if (APICallError.isInstance(error)) {
    if (isCreditError(error)) return "insufficient_credit";
    switch (error.statusCode) {
      case 401:
      case 403:
        return "unauthorized";
      case 429:
        return "rate_limited";
      case 529:
        return "overloaded";
      default:
        return "unavailable";
    }
  }
  if (LoadAPIKeyError.isInstance(error)) return "missing_key";
  if (NoObjectGeneratedError.isInstance(error)) {
    return error.finishReason === "content-filter" ? "refused" : "invalid_output";
  }
  if (NoOutputGeneratedError.isInstance(error)) return "invalid_output";
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "timeout";
  }
  return "unavailable";
}

function fail<T>(reason: AiFailureReason): AiResult<T> {
  return { ok: false, reason, message: AI_FAILURE_MESSAGES[reason] };
}

export type RunAiTaskOptions = {
  config?: AiConfig;
  generate?: AiGenerate;
  timeoutMs?: number;
};

const defaultGenerate = createGenerate();

/**
 * 모든 AI 호출이 거쳐 가는 공통 함수.
 * 시간 초과, 키 없음, 401, 429, 크레딧 부족 등 어떤 실패에도 예외를 던지지 않고
 * { ok: false, reason }을 돌려준다.
 */
export async function runAiTask<T>(task: AiTask<T>, options: RunAiTaskOptions = {}): Promise<AiResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();

  try {
    const config = options.config ?? readAiConfig();
    if (!config.apiKey) return fail("missing_key");

    const generate = options.generate ?? defaultGenerate;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve("timeout");
      }, options.timeoutMs ?? AI_TIMEOUT_MS);
    });

    const outcome = await Promise.race([
      generate({
        apiKey: config.apiKey,
        model: config.model,
        system: task.system,
        prompt: task.prompt,
        schema: task.schema,
        maxOutputTokens: task.maxOutputTokens ?? 2_000,
        abortSignal: controller.signal,
      }),
      timedOut,
    ]);

    if (outcome === "timeout") return fail("timeout");
    if (outcome.finishReason === "content-filter") return fail("refused");

    const parsed = task.schema.safeParse(outcome.output);
    if (!parsed.success) return fail("invalid_output");
    if (task.validate && !task.validate(parsed.data)) return fail("invalid_output");
    return { ok: true, data: parsed.data, model: config.model };
  } catch (error) {
    return fail(controller.signal.aborted ? "timeout" : classifyAiError(error));
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────── 스트리밍 ───────────────────────── */

/** 스트리밍 호출 하나의 조각. 테스트에서는 이 형식의 모의 스트림을 넣는다. */
export type AiStreamPart =
  | { type: "text"; text: string }
  | { type: "finish"; finishReason: string }
  | { type: "error"; error: unknown };

export type AiStreamArgs = Omit<AiGenerateArgs, "schema">;
export type AiStreamGenerate = (args: AiStreamArgs) => AsyncIterable<AiStreamPart>;

/** AI SDK의 streamText를 위 조각 형식으로 바꾼다. */
export function createStreamGenerate(modelFactory: ModelFactory = anthropicModel): AiStreamGenerate {
  return async function* ({ apiKey, model, system, prompt, maxOutputTokens, abortSignal }) {
    const result = streamText({
      model: modelFactory(apiKey, model),
      system,
      prompt,
      maxOutputTokens,
      maxRetries: 0,
      abortSignal,
      providerOptions: ANTHROPIC_OPTIONS,
      // 오류는 아래 error 조각으로 받아 처리한다. 서버 로그에 키나 본문을 남기지 않는다.
      onError: () => {},
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") yield { type: "text", text: part.text };
      else if (part.type === "finish") yield { type: "finish", finishReason: part.finishReason };
      else if (part.type === "error") yield { type: "error", error: part.error };
      else if (part.type === "abort") {
        const error = new Error("aborted");
        error.name = "AbortError";
        yield { type: "error", error };
      }
    }
  };
}

export type AiStreamTask = {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
};

export type AiStreamEvent =
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; reason: AiFailureReason; message: string };

/** 스트림 전체의 최대 시간. 조각 사이 대기는 AI_TIMEOUT_MS(8초)를 넘지 못한다. */
export const AI_STREAM_MAX_MS = 55_000;

export type RunAiStreamOptions = {
  config?: AiConfig;
  stream?: AiStreamGenerate;
  /** 다음 조각을 기다리는 최대 시간. 기본 8초 */
  timeoutMs?: number;
  maxDurationMs?: number;
};

const defaultStream = createStreamGenerate();

function failEvent(reason: AiFailureReason): AiStreamEvent {
  return { type: "error", reason, message: AI_FAILURE_MESSAGES[reason] };
}

async function nextWithin<T>(iterator: AsyncIterator<T>, ms: number): Promise<IteratorResult<T> | "timeout"> {
  if (ms <= 0) return "timeout";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 스트리밍 AI 호출의 공통 함수. runAiTask와 같은 원칙을 따른다.
 * 키 없음, 401, 429, 크레딧 부족, 시간 초과, 거절 등 어떤 실패에도 예외를 던지지 않고
 * 마지막 이벤트로 { type: "error", reason }을 낸다. 성공하면 마지막 이벤트는 { type: "done" }이다.
 * 첫 조각과 조각 사이가 8초를 넘으면 시간 초과로 끊는다.
 */
export async function* runAiStream(
  task: AiStreamTask,
  options: RunAiStreamOptions = {},
): AsyncGenerator<AiStreamEvent> {
  const controller = new AbortController();
  let iterator: AsyncIterator<AiStreamPart> | undefined;
  let settled = false;

  try {
    const config = options.config ?? readAiConfig();
    if (!config.apiKey) {
      settled = true;
      yield failEvent("missing_key");
      return;
    }

    const stream = options.stream ?? defaultStream;
    iterator = stream({
      apiKey: config.apiKey,
      model: config.model,
      system: task.system,
      prompt: task.prompt,
      maxOutputTokens: task.maxOutputTokens ?? 2_000,
      abortSignal: controller.signal,
    })[Symbol.asyncIterator]();

    const idleMs = options.timeoutMs ?? AI_TIMEOUT_MS;
    const deadline = Date.now() + (options.maxDurationMs ?? AI_STREAM_MAX_MS);

    while (true) {
      const next = await nextWithin(iterator, Math.min(idleMs, deadline - Date.now()));
      if (next === "timeout") {
        controller.abort();
        settled = true;
        yield failEvent("timeout");
        return;
      }
      if (next.done) break;

      const part = next.value;
      if (part.type === "text") {
        if (part.text) yield { type: "text", text: part.text };
        continue;
      }
      if (part.type === "error") {
        settled = true;
        yield failEvent(controller.signal.aborted ? "timeout" : classifyAiError(part.error));
        return;
      }
      // 거절되었거나, 길이 제한으로 잘렸거나, 오류로 끝난 글은 쓰지 않는다.
      if (part.finishReason === "content-filter") {
        settled = true;
        yield failEvent("refused");
        return;
      }
      if (part.finishReason === "length") {
        settled = true;
        yield failEvent("invalid_output");
        return;
      }
      if (part.finishReason === "error") {
        settled = true;
        yield failEvent("unavailable");
        return;
      }
    }

    settled = true;
    yield { type: "done" };
  } catch (error) {
    settled = true;
    yield failEvent(controller.signal.aborted ? "timeout" : classifyAiError(error));
  } finally {
    // 받는 쪽이 중간에 끊었으면(브라우저 연결 종료 등) 모델 호출도 멈춘다.
    if (!settled) controller.abort();
    void Promise.resolve(iterator?.return?.()).catch(() => {});
  }
}
