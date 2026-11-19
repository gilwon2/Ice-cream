import "server-only";

/** ANTHROPIC_MODEL이 없을 때 쓰는 모델 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export type AiConfig = {
  apiKey: string | null;
  model: string;
  /** DEMO_ACCESS_CODE. 없으면 AI 라우트를 열지 않는다. */
  accessCode: string | null;
};

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
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
  };
}
