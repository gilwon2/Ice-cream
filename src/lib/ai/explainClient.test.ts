import { describe, expect, it, vi } from "vitest";
import { YOUTH_RENT } from "@/data/policies/youthRent";
import { UNKNOWN_ANSWER } from "@/lib/rules";
import { createAiAccessStore, type KeyValueStorage } from "./access";
import { createExplanationCache, requestExplanation } from "./explainClient";
import { EXPLAIN_PATH, buildExplainRequest, explainCacheKey } from "./explainShared";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const ageRule = YOUTH_RENT.rules.find((rule) => rule.id === "rent-age")!;
const houseRule = YOUTH_RENT.rules.find((rule) => rule.id === "rent-no-house")!;

function setup({ access = true } = {}) {
  const storage = memoryStorage();
  const store = createAiAccessStore(() => storage);
  if (access) {
    store.giveConsent();
    store.setAccessCode("demo");
  }
  const cache = createExplanationCache(() => storage);
  return { storage, store, cache };
}

const okResponse = (note: string) =>
  new Response(JSON.stringify({ ok: true, personalNote: note }), { status: 200 });

describe("캐시 재사용", () => {
  it("같은 규칙·같은 조건 값이면 두 번째는 서버를 부르지 않는다", async () => {
    const { store, cache, storage } = setup();
    const fetchImpl = vi.fn(async () => okResponse("주택이 있는지 먼저 확인해 보세요."));
    const request = buildExplainRequest(YOUTH_RENT, houseRule, { ownsHouse: UNKNOWN_ANSWER });

    expect(await requestExplanation(request, { store, cache, fetchImpl })).toEqual({
      kind: "ready",
      note: "주택이 있는지 먼저 확인해 보세요.",
      cached: false,
    });
    expect(await requestExplanation(request, { store, cache, fetchImpl })).toMatchObject({
      kind: "ready",
      cached: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(EXPLAIN_PATH, expect.anything());
    expect(storage.data.get(explainCacheKey(request))).toBe("주택이 있는지 먼저 확인해 보세요.");
  });

  it("다른 질문의 답이 바뀌어도 같은 키라 다시 부르지 않는다", () => {
    const first = buildExplainRequest(YOUTH_RENT, ageRule, { birthDate: "2001-05-10", youthIncome: "150" });
    const second = buildExplainRequest(YOUTH_RENT, ageRule, { birthDate: "2001-05-10", youthIncome: "300" });
    expect(explainCacheKey(first)).toBe(explainCacheKey(second));
  });

  it("이 규칙의 조건 값이 바뀌면 새로 부른다", async () => {
    const { store, cache } = setup();
    const fetchImpl = vi.fn(async () => okResponse("설명"));
    await requestExplanation(buildExplainRequest(YOUTH_RENT, ageRule, { birthDate: "2001-05-10" }), {
      store,
      cache,
      fetchImpl,
    });
    await requestExplanation(buildExplainRequest(YOUTH_RENT, ageRule, { birthDate: "1990-05-10" }), {
      store,
      cache,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("다른 탭처럼 저장소만 남아 있어도 저장된 설명을 쓴다", async () => {
    const { storage, store } = setup();
    const request = buildExplainRequest(YOUTH_RENT, houseRule, { ownsHouse: UNKNOWN_ANSWER });
    storage.data.set(explainCacheKey(request), "저장된 설명");
    const fetchImpl = vi.fn();
    const result = await requestExplanation(request, {
      store,
      cache: createExplanationCache(() => storage),
      fetchImpl,
    });
    expect(result).toEqual({ kind: "ready", note: "저장된 설명", cached: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("실패 대체", () => {
  const request = buildExplainRequest(YOUTH_RENT, houseRule, { ownsHouse: UNKNOWN_ANSWER });

  it("동의나 접근 코드가 없으면 부르지 않고 no_access다", async () => {
    const { store, cache } = setup({ access: false });
    const fetchImpl = vi.fn();
    expect(await requestExplanation(request, { store, cache, fetchImpl })).toEqual({ kind: "no_access" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("AI가 실패하면 안내 문구를 돌려주고 저장하지 않는다", async () => {
    const { store, cache } = setup();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, reason: "timeout", message: "AI 응답이 늦어요." }), {
          status: 200,
        }),
    );
    expect(await requestExplanation(request, { store, cache, fetchImpl })).toEqual({
      kind: "failed",
      message: "AI 응답이 늦어요.",
      needsCode: false,
    });
    expect(cache.get(explainCacheKey(request))).toBeNull();
    await requestExplanation(request, { store, cache, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("접근 코드가 틀리면 코드를 지우고 다시 입력하게 한다", async () => {
    const { store, cache } = setup();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "invalid_access_code", message: "틀렸어요" } }), {
          status: 401,
        }),
    );
    expect(await requestExplanation(request, { store, cache, fetchImpl })).toEqual({
      kind: "failed",
      message: "틀렸어요",
      needsCode: true,
    });
    expect(store.getAccessCode()).toBeNull();
  });

  it("네트워크가 끊겨도 예외 없이 failed다", async () => {
    const { store, cache } = setup();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await requestExplanation(request, { store, cache, fetchImpl })).toMatchObject({ kind: "failed" });
  });
});
