import { anthropic } from "@ai-sdk/anthropic";
import {
  APICallError,
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { ACCESS_CODE_HEADER, INVALID_ACCESS_CODE_MESSAGE } from "@/lib/access-code";
import { diagnosisSchema } from "@/lib/causes";
import { clientIp, createRateLimiter, hasValidAccessCode } from "@/lib/demo-guard";
import { buildSystemPrompt } from "@/lib/diagnosis-prompt";
import { evaluateAll, todayInKorea } from "@/lib/eligibility";
import { policies } from "@/lib/policies";
import { sanitizeFindings } from "@/lib/plan";
import { profileSchema } from "@/lib/profile";

export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
const MAX_USER_TEXT_LENGTH = 1000;
const MAX_SUMMARY_LENGTH = 300;

const checkRateLimit = createRateLimiter({ limit: 10, windowMs: 60_000 });

const requestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(40),
  profile: profileSchema,
});

function plainError(message: string, status: number, headers?: Record<string, string>) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}

function hasOversizedUserText(messages: UIMessage[]) {
  return messages.some(
    (message) =>
      message.role === "user" &&
      message.parts.some(
        (part) => part.type === "text" && part.text.length > MAX_USER_TEXT_LENGTH,
      ),
  );
}

function describeStreamError(error: unknown) {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401) return "Claude API 키가 올바르지 않습니다. .env.local을 확인해 주세요.";
    if (error.statusCode === 429) return "요청이 많아 잠시 후 다시 시도해 주세요.";
  }
  return "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function POST(request: Request) {
  // 코드 대입 시도도 함께 막도록 접근 코드보다 먼저 검사한다.
  const rateLimit = checkRateLimit(clientIp(request.headers));
  if (!rateLimit.allowed) {
    return plainError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  if (!hasValidAccessCode(process.env.DEMO_ACCESS_CODE, request.headers.get(ACCESS_CODE_HEADER))) {
    return plainError(INVALID_ACCESS_CODE_MESSAGE, 401);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return plainError(
      "ANTHROPIC_API_KEY가 설정되지 않아 AI 대화를 시작할 수 없습니다. 자격 판정 결과는 그대로 볼 수 있습니다.",
      503,
    );
  }

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return plainError("요청 형식이 올바르지 않습니다.", 400);

  const { profile } = body.data;
  // 클라이언트가 보낸 판정을 믿지 않고 서버에서 함수로 다시 계산한다.
  const results = evaluateAll(policies, profile, todayInKorea());

  const tools = {
    submit_diagnosis: tool({
      description: "대화로 확인한 원인을 기록하고 진단을 마칩니다.",
      inputSchema: diagnosisSchema,
      execute: async ({ summary, findings }) => ({
        summary: summary.slice(0, MAX_SUMMARY_LENGTH),
        findings: sanitizeFindings(findings, results),
      }),
    }),
  };

  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: body.data.messages, tools });
  } catch {
    return plainError("대화 내용 형식이 올바르지 않습니다.", 400);
  }
  if (hasOversizedUserText(messages)) {
    return plainError(`메시지는 ${MAX_USER_TEXT_LENGTH}자 이내로 입력해 주세요.`, 400);
  }

  const result = streamText({
    model: anthropic(MODEL),
    system: buildSystemPrompt(profile, policies, results),
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: stepCountIs(1),
    maxOutputTokens: 8000,
    providerOptions: {
      anthropic: { effort: "low", fallbacks: "default" },
    },
  });

  return result.toUIMessageStreamResponse({ onError: describeStreamError });
}
