import { postAi, type AiAccessStore, type KeyValueStorage } from "./access";
import {
  EXPLAIN_PATH,
  explainCacheKey,
  type ExplainRequest,
  type ExplainResponse,
} from "./explainShared";

/** 브라우저에서 설명을 요청하고, 성공한 설명만 sessionStorage에 저장한다. */

export type ExplanationCache = {
  get: (key: string) => string | null;
  set: (key: string, note: string) => void;
};

export function createExplanationCache(getStorage: () => KeyValueStorage | null): ExplanationCache {
  const memory = new Map<string, string>();
  return {
    get: (key) => {
      try {
        const value = getStorage()?.getItem(key);
        if (value) return value;
      } catch {
        // 저장소를 쓸 수 없으면 메모리만 본다.
      }
      return memory.get(key) ?? null;
    },
    set: (key, note) => {
      memory.set(key, note);
      try {
        getStorage()?.setItem(key, note);
      } catch {
        // 저장 실패는 무시한다. 다음에 다시 요청할 뿐이다.
      }
    },
  };
}

export type ExplanationResult =
  | { kind: "ready"; note: string; cached: boolean }
  | { kind: "no_access" }
  | { kind: "failed"; message: string; needsCode: boolean };

/**
 * 같은 규칙·같은 조건 값이면 저장된 설명을 쓰고 서버를 부르지 않는다.
 * 접근 코드가 없거나 실패하면 예외 없이 결과 종류로 알려준다.
 */
export async function requestExplanation(
  request: ExplainRequest,
  {
    store,
    cache,
    fetchImpl = fetch,
  }: { store: AiAccessStore; cache: ExplanationCache; fetchImpl?: typeof fetch },
): Promise<ExplanationResult> {
  const key = explainCacheKey(request);
  const cached = cache.get(key);
  if (cached) return { kind: "ready", note: cached, cached: true };
  if (!store.hasConsent() || !store.getAccessCode()) return { kind: "no_access" };

  const response = await postAi<ExplainResponse>(EXPLAIN_PATH, request, { store, fetchImpl });
  if (!response.ok) {
    return {
      kind: "failed",
      message: response.message,
      needsCode: response.reason === "invalid_access_code",
    };
  }
  if (!response.data.ok) return { kind: "failed", message: response.data.message, needsCode: false };

  cache.set(key, response.data.personalNote);
  return { kind: "ready", note: response.data.personalNote, cached: false };
}
