/** 브라우저와 서버가 함께 쓰는 데모 접근 코드 약속. */
export const ACCESS_CODE_HEADER = "x-demo-access-code";
export const INVALID_ACCESS_CODE_MESSAGE = "접근 코드가 올바르지 않습니다";

/** HTTP 헤더에는 한글을 그대로 넣을 수 없어 인코딩해서 보낸다. */
export function encodeAccessCode(code: string) {
  return encodeURIComponent(code);
}
