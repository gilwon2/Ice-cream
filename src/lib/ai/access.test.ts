import { describe, expect, it, vi } from "vitest";
import {
  AI_STORAGE_KEYS,
  createAiAccessStore,
  postAi,
  verifyAccessCode,
  type KeyValueStorage,
} from "./access";
import { ACCESS_CODE_HEADER, AI_SESSION_PATH } from "./shared";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const brokenStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const guardError = (status: number, code: string, message = "안내") =>
  jsonResponse(status, { error: { code, message } });

describe("접근 상태 저장 (sessionStorage)", () => {
  it("동의와 접근 코드를 저장하고 지운다", () => {
    const storage = memoryStorage();
    const store = createAiAccessStore(() => storage);
    expect(store.hasConsent()).toBe(false);
    store.giveConsent();
    store.setAccessCode("  demo ");
    expect(store.hasConsent()).toBe(true);
    expect(storage.data.get(AI_STORAGE_KEYS.accessCode)).toBe("demo");
    store.clearAccessCode();
    expect(store.getAccessCode()).toBeNull();
  });

  it("저장소를 쓸 수 없어도 예외 없이 이 탭의 메모리로 동작한다", () => {
    const store = createAiAccessStore(() => brokenStorage);
    store.giveConsent();
    store.setAccessCode("demo");
    expect(store.hasConsent()).toBe(true);
    expect(store.getAccessCode()).toBe("demo");
  });

  it("저장소가 없는 환경(서버 렌더링)에서도 동작한다", () => {
    const store = createAiAccessStore(() => null);
    store.setAccessCode("demo");
    expect(store.getAccessCode()).toBe("demo");
  });
});

describe("postAi", () => {
  it("코드가 없으면 요청하지 않는다", async () => {
    const fetchImpl = vi.fn();
    const store = createAiAccessStore(() => memoryStorage());
    const result = await postAi("/api/ai/x", {}, { store, fetchImpl });
    expect(result).toMatchObject({ ok: false, reason: "invalid_access_code" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("접근 코드를 인코딩해 헤더로 보낸다", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    const store = createAiAccessStore(() => memoryStorage());
    store.setAccessCode("청년2026");
    expect(await postAi("/api/ai/x", { a: 1 }, { store, fetchImpl })).toEqual({ ok: true, data: { ok: true } });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)[ACCESS_CODE_HEADER]).toBe(encodeURIComponent("청년2026"));
    expect(init.body).toBe('{"a":1}');
  });

  it("401이면 저장된 코드를 지워 다시 입력받게 한다", async () => {
    const store = createAiAccessStore(() => memoryStorage());
    store.setAccessCode("old");
    const fetchImpl = vi.fn(async () => guardError(401, "invalid_access_code", "틀렸어요"));
    expect(await postAi("/api/ai/x", {}, { store, fetchImpl })).toEqual({
      ok: false,
      reason: "invalid_access_code",
      message: "틀렸어요",
    });
    expect(store.getAccessCode()).toBeNull();
  });

  it("429면 코드는 그대로 두고 rate_limited를 돌려준다", async () => {
    const store = createAiAccessStore(() => memoryStorage());
    store.setAccessCode("demo");
    const fetchImpl = vi.fn(async () => guardError(429, "rate_limited"));
    expect(await postAi("/api/ai/x", {}, { store, fetchImpl })).toMatchObject({ reason: "rate_limited" });
    expect(store.getAccessCode()).toBe("demo");
  });

  it("네트워크 오류도 예외 없이 network로 돌려준다", async () => {
    const store = createAiAccessStore(() => memoryStorage());
    store.setAccessCode("demo");
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await postAi("/api/ai/x", {}, { store, fetchImpl })).toMatchObject({ ok: false, reason: "network" });
  });
});

describe("verifyAccessCode", () => {
  it("빈 코드는 서버에 보내지 않는다", async () => {
    const fetchImpl = vi.fn();
    const store = createAiAccessStore(() => memoryStorage());
    expect(await verifyAccessCode("  ", { store, fetchImpl })).toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("맞는 코드는 확인 라우트로 검증한 뒤 저장한다", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true, aiAvailable: true }));
    const store = createAiAccessStore(() => memoryStorage());
    expect(await verifyAccessCode("demo", { store, fetchImpl })).toMatchObject({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(AI_SESSION_PATH, expect.anything());
    expect(store.getAccessCode()).toBe("demo");
  });

  it.each([
    [401, "invalid_access_code"],
    [429, "rate_limited"],
    [503, "not_configured"],
  ])("%i 응답이면 확인되지 않은 코드를 남기지 않는다", async (status, code) => {
    const fetchImpl = vi.fn(async () => guardError(status, code));
    const store = createAiAccessStore(() => memoryStorage());
    expect(await verifyAccessCode("demo", { store, fetchImpl })).toMatchObject({ ok: false, reason: code });
    expect(store.getAccessCode()).toBeNull();
  });
});
