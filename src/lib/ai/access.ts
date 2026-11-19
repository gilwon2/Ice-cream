import {
  ACCESS_CODE_HEADER,
  AI_GUARD_MESSAGES,
  AI_SESSION_PATH,
  encodeAccessCode,
  type AiErrorBody,
  type AiGuardErrorCode,
} from "./shared";

/** 브라우저 쪽 AI 접근 상태. 서버 비밀 값은 다루지 않는다. */

export const AI_STORAGE_KEYS = {
  accessCode: "youth-policy.ai.accessCode",
  consent: "youth-policy.ai.consent.v1",
} as const;

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 브라우저의 sessionStorage. 서버 렌더링 중이거나 막혀 있으면 null이다. */
export function browserSessionStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export type AiAccessStore = {
  getAccessCode: () => string | null;
  setAccessCode: (code: string) => void;
  clearAccessCode: () => void;
  hasConsent: () => boolean;
  giveConsent: () => void;
};

/**
 * sessionStorage에 접근 코드와 동의 여부를 저장한다.
 * 저장소를 쓸 수 없으면(사생활 보호 모드 등) 이 탭의 메모리에만 보관한다.
 */
export function createAiAccessStore(getStorage: () => KeyValueStorage | null): AiAccessStore {
  const memory = new Map<string, string>();

  const read = (key: string) => {
    try {
      const value = getStorage()?.getItem(key);
      if (value !== null && value !== undefined) return value;
    } catch {}
    return memory.get(key) ?? null;
  };
  const write = (key: string, value: string) => {
    memory.set(key, value);
    try {
      getStorage()?.setItem(key, value);
    } catch {}
  };
  const remove = (key: string) => {
    memory.delete(key);
    try {
      getStorage()?.removeItem(key);
    } catch {}
  };

  return {
    getAccessCode: () => read(AI_STORAGE_KEYS.accessCode),
    setAccessCode: (code) => write(AI_STORAGE_KEYS.accessCode, code.trim()),
    clearAccessCode: () => remove(AI_STORAGE_KEYS.accessCode),
    hasConsent: () => read(AI_STORAGE_KEYS.consent) === "yes",
    giveConsent: () => write(AI_STORAGE_KEYS.consent, "yes"),
  };
}

export type AiRequestFailure = {
  ok: false;
  reason: AiGuardErrorCode | "network";
  message: string;
};

export type AiRequestResult<T> = { ok: true; data: T } | AiRequestFailure;

async function failureFrom(response: Response): Promise<AiRequestFailure> {
  try {
    const body = (await response.json()) as AiErrorBody;
    if (body?.error?.code) return { ok: false, reason: body.error.code, message: body.error.message };
  } catch {}
  return { ok: false, reason: "network", message: "AI 서버에 연결하지 못했어요." };
}

/**
 * 접근 코드를 붙여 AI 라우트를 호출한다.
 * 401이면 저장된 코드를 지워 다음에 다시 입력받게 한다. 예외를 던지지 않는다.
 */
export async function postAi<T>(
  path: string,
  body: unknown,
  options: { store: AiAccessStore; fetchImpl?: typeof fetch },
): Promise<AiRequestResult<T>> {
  const sent = await sendAi(path, body, options);
  if (!sent.ok) return sent;
  const response = sent.data;

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, reason: "network", message: "AI 서버 응답을 읽지 못했어요." };
  }
}

/**
 * 접근 코드를 붙여 AI 라우트를 호출하고, 성공하면 응답을 그대로 돌려준다(스트림 읽기용).
 * 401이면 저장된 코드를 지운다. 예외를 던지지 않는다.
 */
export async function sendAi(
  path: string,
  body: unknown,
  {
    store,
    fetchImpl = fetch,
    signal,
  }: { store: AiAccessStore; fetchImpl?: typeof fetch; signal?: AbortSignal },
): Promise<AiRequestResult<Response>> {
  const code = store.getAccessCode();
  if (!code) {
    return {
      ok: false,
      reason: "invalid_access_code",
      message: AI_GUARD_MESSAGES.invalid_access_code,
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", [ACCESS_CODE_HEADER]: encodeAccessCode(code) },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return { ok: false, reason: "network", message: "AI 서버에 연결하지 못했어요." };
  }

  if (response.ok) return { ok: true, data: response };

  const failure = await failureFrom(response);
  if (failure.reason === "invalid_access_code") store.clearAccessCode();
  return failure;
}

/** 입력한 접근 코드를 서버에 확인하고, 맞으면 저장한다. */
export async function verifyAccessCode(
  code: string,
  { store, fetchImpl = fetch }: { store: AiAccessStore; fetchImpl?: typeof fetch },
): Promise<AiRequestResult<{ ok: true; aiAvailable: boolean }>> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, reason: "invalid_access_code", message: "접근 코드를 입력해 주세요." };
  }
  store.setAccessCode(trimmed);
  const result = await postAi<{ ok: true; aiAvailable: boolean }>(AI_SESSION_PATH, {}, {
    store,
    fetchImpl,
  });
  // 확인되지 않은 코드는 남기지 않는다.
  if (!result.ok) store.clearAccessCode();
  return result;
}
