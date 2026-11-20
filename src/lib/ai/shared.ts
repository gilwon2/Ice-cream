/**
 * 브라우저와 서버가 함께 쓰는 AI 관련 약속.
 * 비밀 값은 두지 않는다. 키는 서버 전용 config.ts에서만 읽는다.
 */

/** 접근 코드를 실어 보내는 요청 헤더 */
export const ACCESS_CODE_HEADER = "x-demo-access-code";

/**
 * AI 기능을 처음 쓸 때 보여주고 동의를 받는 개인정보 안내.
 * 서버는 입력값으로 판정만 다시 계산하고, AI에는 판정 결과와 공고 기준만 보낸다(context.ts, explain.ts).
 */
export const AI_CONSENT_TEXT =
  "설명과 문안 작성을 위해 조건별 판정 결과가 AI(Anthropic)에 전송돼요. 입력한 생년월일·금액 같은 값과 이름, 연락처는 보내지 않아요";

/** 입력 화면의 저장·전송 안내. 문구를 바꾸면 실제 동작(서버 저장, sessionStorage 키)과 맞는지 확인한다. */
export const INPUT_PRIVACY_TEXT = "입력한 내용은 판정에만 쓰이고 저장하지 않아요. AI에는 판정 결과만 전달돼요.";

/** STEP 3 상단에 한 번 보여주는 짧은 안내. INPUT_PRIVACY_TEXT와 같은 동작을 설명한다. */
export const INPUT_PRIVACY_SHORT = "입력한 내용은 저장하지 않고, AI에는 판정 결과만 전달돼요.";

/** 접근 코드 검증용 API 경로 */
export const AI_SESSION_PATH = "/api/ai/session";

export type AiGuardErrorCode =
  | "rate_limited"
  | "invalid_access_code"
  | "not_configured"
  | "invalid_request";

export type AiErrorBody = { error: { code: AiGuardErrorCode; message: string } };

export const AI_GUARD_MESSAGES: Record<AiGuardErrorCode, string> = {
  rate_limited: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  invalid_access_code: "접근 코드가 올바르지 않아요.",
  not_configured: "AI 기능이 아직 설정되지 않았어요.",
  invalid_request: "요청 형식이 올바르지 않아요.",
};

/** HTTP 헤더에는 한글을 그대로 넣을 수 없어 인코딩해서 보낸다. */
export function encodeAccessCode(code: string): string {
  return encodeURIComponent(code.trim().normalize("NFC"));
}

export function decodeAccessCode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
