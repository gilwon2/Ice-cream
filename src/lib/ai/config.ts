import "server-only";

/** ANTHROPIC_MODEL이 없을 때 쓰는 모델 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

/**
 * AI_RATE_LIMIT_PER_MINUTE가 없거나 잘못됐을 때 쓰는 IP당 1분 호출 한도.
 * 심사위원이 같은 네트워크(같은 IP)에서 동시에 접속할 수 있어 넉넉히 둔다.
 */
export const DEFAULT_AI_RATE_LIMIT_PER_MINUTE = 30;

export type AiConfig = {
  apiKey: string | null;
  model: string;
  /** DEMO_ACCESS_CODE. 없으면 AI 라우트를 열지 않는다. */
  accessCode: string | null;
  /** AI_RATE_LIMIT_PER_MINUTE. IP당 1분 AI 호출 한도 */
  rateLimitPerMinute: number;
};

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

/** 1 이상의 정수만 받는다. "abc", "2.5", "0", "-1" 같은 값은 기본값으로 돌린다. */
function readPositiveInt(env: Env, name: string, fallback: number): number {
  const value = read(env, name);
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

/**
 * 서버 환경변수에서 AI 설정을 읽는다. 이 파일은 server-only라
 * 브라우저 번들에 들어가지 않으며, NEXT_PUBLIC_ 변수는 쓰지 않는다.
 */
export function readAiConfig(env: Env = process.env): AiConfig {
  return {
    apiKey: read(env, "ANTHROPIC_API_KEY"),
    model: read(env, "ANTHROPIC_MODEL") ?? DEFAULT_ANTHROPIC_MODEL,
    accessCode: read(env, "DEMO_ACCESS_CODE"),
    rateLimitPerMinute: readPositiveInt(env, "AI_RATE_LIMIT_PER_MINUTE", DEFAULT_AI_RATE_LIMIT_PER_MINUTE),
  };
}
