import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { APICallError, NoObjectGeneratedError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AI_FAILURE_MESSAGES,
  AI_TIMEOUT_MS,
  classifyAiError,
  createGenerate,
  runAiTask,
  type AiGenerate,
} from "./client";
import { DEFAULT_ANTHROPIC_MODEL, readAiConfig, type AiConfig } from "./config";

const schema = z.object({ summary: z.string() });
const task = { system: "시스템", prompt: "질문", schema };
const config: AiConfig = { apiKey: "test-key", model: "claude-sonnet-5-5", accessCode: "demo" };

function apiError(statusCode: number, message = "API error", responseBody?: string) {
  return new APICallError({
    message,
    url: "https://api.anthropic.com/v1/messages",
    requestBodyValues: {},
    statusCode,
    responseBody,
    isRetryable: false,
  });
}

const succeed: AiGenerate = async () => ({ output: { summary: "안내" }, finishReason: "stop" });
const throwing = (error: unknown): AiGenerate => async () => {
  throw error;
};

describe("runAiTask: 성공", () => {
  it("검증된 응답과 모델 이름을 돌려준다", async () => {
    const generate = vi.fn(succeed);
    const result = await runAiTask(task, { config, generate });
    expect(result).toEqual({ ok: true, data: { summary: "안내" }, model: "claude-sonnet-5-5" });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        model: "claude-sonnet-5-5",
        system: "시스템",
        prompt: "질문",
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it("기본 시간 제한은 8초다", () => {
    expect(AI_TIMEOUT_MS).toBe(8_000);
  });
});

describe("runAiTask: 실패해도 예외를 던지지 않는다", () => {
  it("키가 없으면 모델을 부르지 않고 missing_key다", async () => {
    const generate = vi.fn(succeed);
    const result = await runAiTask(task, { config: { ...config, apiKey: null }, generate });
    expect(result).toEqual({ ok: false, reason: "missing_key", message: AI_FAILURE_MESSAGES.missing_key });
    expect(generate).not.toHaveBeenCalled();
  });

  it("시간 제한을 넘기면 요청을 취소하고 timeout이다", async () => {
    let signal: AbortSignal | undefined;
    const hanging: AiGenerate = (args) => {
      signal = args.abortSignal;
      return new Promise(() => {});
    };
    const started = Date.now();
    const result = await runAiTask(task, { config, generate: hanging, timeoutMs: 30 });
    expect(result).toMatchObject({ ok: false, reason: "timeout" });
    expect(signal?.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("취소 신호를 받고 모델이 오류를 던져도 timeout이다", async () => {
    const abortAware: AiGenerate = ({ abortSignal }) =>
      new Promise((_, reject) => {
        abortSignal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    const result = await runAiTask(task, { config, generate: abortAware, timeoutMs: 20 });
    expect(result).toMatchObject({ ok: false, reason: "timeout" });
  });

  it.each([
    [apiError(401), "unauthorized"],
    [apiError(403), "unauthorized"],
    [apiError(429), "rate_limited"],
    [apiError(400, "Your credit balance is too low to access the Anthropic API."), "insufficient_credit"],
    [apiError(400, "Bad Request", '{"error":{"message":"Your credit balance is too low"}}'), "insufficient_credit"],
    [apiError(402), "insufficient_credit"],
    [apiError(529), "overloaded"],
    [apiError(500), "unavailable"],
    [new Error("socket hang up"), "unavailable"],
    ["문자열 오류", "unavailable"],
  ])("%s 오류는 %s다", async (error, reason) => {
    const result = await runAiTask(task, { config, generate: throwing(error) });
    expect(result).toMatchObject({ ok: false, reason });
    if (!result.ok) expect(result.message).toBe(AI_FAILURE_MESSAGES[result.reason]);
  });

  it("동기적으로 던지는 오류도 잡는다", async () => {
    const generate: AiGenerate = () => {
      throw apiError(401);
    };
    expect(await runAiTask(task, { config, generate })).toMatchObject({ ok: false, reason: "unauthorized" });
  });

  it("거절(content-filter)이면 refused다", async () => {
    const generate: AiGenerate = async () => ({ output: undefined, finishReason: "content-filter" });
    expect(await runAiTask(task, { config, generate })).toMatchObject({ ok: false, reason: "refused" });
  });

  it("응답이 스키마와 맞지 않으면 invalid_output이다", async () => {
    const generate: AiGenerate = async () => ({ output: { other: 1 }, finishReason: "stop" });
    expect(await runAiTask(task, { config, generate })).toMatchObject({ ok: false, reason: "invalid_output" });
  });

  it("구조화 출력 생성 실패는 이유에 따라 나눈다", () => {
    const noObject = (finishReason: "stop" | "content-filter") =>
      new NoObjectGeneratedError({
        message: "no object",
        response: { id: "1", timestamp: new Date(), modelId: "m" },
        usage: {
          inputTokens: undefined,
          inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
          outputTokens: undefined,
          outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
          totalTokens: undefined,
        },
        finishReason,
      });
    expect(classifyAiError(noObject("stop"))).toBe("invalid_output");
    expect(classifyAiError(noObject("content-filter"))).toBe("refused");
  });
});

describe("createGenerate: AI SDK 모의 모델로 실제 호출 경로 확인", () => {
  const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  };

  it("구조화 응답을 받고, 재시도 없이 대체 모델 옵션을 보낸다", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: '{"summary":"모의 응답"}' }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage,
        warnings: [],
      }),
    });
    const factory = vi.fn(() => model);
    const result = await runAiTask(task, { config, generate: createGenerate(factory) });

    expect(result).toEqual({ ok: true, data: { summary: "모의 응답" }, model: "claude-sonnet-5-5" });
    expect(factory).toHaveBeenCalledWith("test-key", "claude-sonnet-5-5");
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0].providerOptions?.anthropic).toEqual({
      effort: "low",
      fallbacks: "default",
    });
    expect(model.doGenerateCalls[0].responseFormat?.type).toBe("json");
  });

  it("모델이 거절하면 refused다", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [],
        finishReason: { unified: "content-filter", raw: "refusal" },
        usage,
        warnings: [],
      }),
    });
    const result = await runAiTask(task, { config, generate: createGenerate(() => model) });
    expect(result).toMatchObject({ ok: false, reason: "refused" });
  });

  it("429를 받으면 다시 시도하지 않고 rate_limited다", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw apiError(429);
      },
    });
    const result = await runAiTask(task, { config, generate: createGenerate(() => model) });
    expect(result).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("JSON이 아닌 응답은 invalid_output이다", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: "그냥 문장" }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage,
        warnings: [],
      }),
    });
    const result = await runAiTask(task, { config, generate: createGenerate(() => model) });
    expect(result).toMatchObject({ ok: false, reason: "invalid_output" });
  });
});

describe("환경변수", () => {
  it("모델 기본값은 claude-sonnet-5-5다", () => {
    expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
    expect(readAiConfig({}).model).toBe("claude-sonnet-5-5");
  });

  it("값을 다듬고, 빈 값은 없는 것으로 본다", () => {
    expect(
      readAiConfig({ ANTHROPIC_API_KEY: " key ", ANTHROPIC_MODEL: " ", DEMO_ACCESS_CODE: "" }),
    ).toEqual({ apiKey: "key", model: "claude-sonnet-5-5", accessCode: null });
  });

  it("NEXT_PUBLIC_ 변수는 읽지 않는다", () => {
    expect(
      readAiConfig({ NEXT_PUBLIC_ANTHROPIC_API_KEY: "leak", NEXT_PUBLIC_DEMO_ACCESS_CODE: "leak" }),
    ).toEqual({ apiKey: null, model: "claude-sonnet-5-5", accessCode: null });
  });
});

describe("서버 전용 코드 분리", () => {
  const srcDir = fileURLToPath(new URL("../../", import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
  const sources = files(srcDir).filter((path) => !/\.test\.tsx?$/.test(path));

  it("소스 어디에서도 NEXT_PUBLIC_ 환경변수를 읽지 않는다", () => {
    const offenders = sources.filter((path) =>
      /process\.env\.NEXT_PUBLIC_|env\[\s*["'`]NEXT_PUBLIC_/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it(".env.example에는 세 변수의 이름만 있고 값과 NEXT_PUBLIC_ 변수는 없다", () => {
    const example = readFileSync(join(srcDir, "..", ".env.example"), "utf8");
    const entries = example
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"));
    expect(entries).toEqual(["ANTHROPIC_API_KEY=", "ANTHROPIC_MODEL=", "DEMO_ACCESS_CODE="]);
  });

  it("키를 읽는 파일은 server-only로 표시되어 있다", () => {
    for (const name of ["client.ts", "config.ts", "guard.ts"]) {
      const code = readFileSync(join(srcDir, "lib", "ai", name), "utf8");
      expect(code.startsWith('import "server-only";'), name).toBe(true);
    }
  });

  it("클라이언트 컴포넌트는 서버 전용 AI 모듈을 import하지 않는다", () => {
    const clientFiles = sources.filter((path) => readFileSync(path, "utf8").startsWith('"use client"'));
    const offenders = clientFiles.filter((path) =>
      /from "@\/lib\/ai\/(client|config|guard)"/.test(readFileSync(path, "utf8")),
    );
    expect(clientFiles.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
