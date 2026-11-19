import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { POST as sessionRoute } from "@/app/api/ai/session/route";
import { buildAiContext, aiConditionRequestSchema } from "./context";
import { clientIp, createRateLimiter, guardRequest, hasValidAccessCode } from "./guard";
import { ACCESS_CODE_HEADER, encodeAccessCode } from "./shared";

const CODE = "청년2026";
const bodySchema = z.strictObject({ value: z.number() });

function request({
  ip = "203.0.113.1",
  code = CODE as string | null,
  body = JSON.stringify({ value: 1 }) as string | null,
} = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip };
  if (code !== null) headers[ACCESS_CODE_HEADER] = encodeAccessCode(code);
  return new Request("http://localhost/api/ai/test", {
    method: "POST",
    headers,
    body: body ?? undefined,
  });
}

function guard(req: Request, limiter = createRateLimiter({ limit: 10, windowMs: 60_000 }), now = 0) {
  return guardRequest(req, bodySchema, { limiter, accessCode: CODE, now });
}

async function errorCode(result: Awaited<ReturnType<typeof guard>>) {
  if (result.ok) return null;
  return { status: result.response.status, code: (await result.response.json()).error.code };
}

describe("① 호출 제한 (IP별 1분 10회)", () => {
  it("10번까지 통과하고 11번째는 429와 Retry-After를 돌려준다", async () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) {
      expect((await guard(request(), limiter, 1_000)).ok).toBe(true);
    }
    const blocked = await guard(request(), limiter, 1_000);
    expect(await errorCode(blocked)).toEqual({ status: 429, code: "rate_limited" });
    if (!blocked.ok) expect(blocked.response.headers.get("Retry-After")).toBe("60");
  });

  it("IP마다 따로 세고, 1분이 지나면 다시 허용한다", async () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) await guard(request(), limiter, 0);
    expect((await guard(request(), limiter, 0)).ok).toBe(false);
    expect((await guard(request({ ip: "198.51.100.7" }), limiter, 0)).ok).toBe(true);
    expect((await guard(request(), limiter, 60_000)).ok).toBe(true);
  });

  it("호출 제한을 접근 코드와 본문보다 먼저 검사한다", async () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) await guard(request({ code: "틀린 코드" }), limiter);
    const result = await guard(request({ code: "또 틀린 코드", body: "{" }), limiter);
    expect(await errorCode(result)).toEqual({ status: 429, code: "rate_limited" });
  });

  it("틀린 코드 시도도 횟수에 들어가 코드 대입을 막는다", async () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) {
      expect(await errorCode(await guard(request({ code: `시도${i}` }), limiter))).toEqual({
        status: 401,
        code: "invalid_access_code",
      });
    }
    expect((await errorCode(await guard(request(), limiter)))?.status).toBe(429);
  });
});

describe("② 접근 코드", () => {
  it.each([
    [null, 401],
    ["틀린 코드", 401],
    ["청년2027", 401],
  ])("코드 %s는 %i다", async (code, status) => {
    expect(await errorCode(await guard(request({ code })))).toEqual({ status, code: "invalid_access_code" });
  });

  it("맞는 코드(한글, 앞뒤 공백 포함)는 통과한다", async () => {
    expect((await guard(request({ code: `  ${CODE} ` }))).ok).toBe(true);
  });

  it("서버에 접근 코드가 설정되지 않으면 503으로 닫혀 있다", async () => {
    const result = await guardRequest(request(), bodySchema, {
      limiter: createRateLimiter({ limit: 10, windowMs: 60_000 }),
      accessCode: null,
    });
    expect(await errorCode(result)).toEqual({ status: 503, code: "not_configured" });
  });

  it("코드 비교는 길이가 달라도 예외 없이 거짓이다", () => {
    expect(hasValidAccessCode("abc", encodeAccessCode("a"))).toBe(false);
    expect(hasValidAccessCode("abc", "%E0%A4%A")).toBe(false);
    expect(hasValidAccessCode("abc", "abc")).toBe(true);
  });
});

describe("③ 본문 검증", () => {
  it.each([
    ["깨진 JSON", "{"],
    ["빈 본문", null],
    ["형식이 다른 값", JSON.stringify({ value: "1" })],
    ["허용하지 않은 필드", JSON.stringify({ value: 1, note: "메모 원문" })],
    ["너무 큰 본문", JSON.stringify({ value: 1, pad: "x".repeat(20_000) })],
  ])("%s은 400이다", async (_, body) => {
    expect(await errorCode(await guard(request({ body })))).toEqual({ status: 400, code: "invalid_request" });
  });

  it("통과하면 검증된 본문을 돌려준다", async () => {
    expect(await guard(request())).toEqual({ ok: true, body: { value: 1 } });
  });
});

describe("클라이언트 IP", () => {
  it("프록시가 마지막에 덧붙인 주소를 쓰고, 없으면 x-real-ip를 쓴다", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("접근 코드 확인 라우트 (/api/ai/session)", () => {
  afterEach(() => vi.unstubAllEnvs());

  const sessionRequest = (ip: string, code: string | null) => request({ ip, code, body: "{}" });

  it("맞는 코드면 200이고, AI 키가 없으면 aiAvailable이 false다", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", CODE);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await sessionRoute(sessionRequest("192.0.2.10", CODE));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, aiAvailable: false });
  });

  it("틀린 코드는 401이다", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", CODE);
    expect((await sessionRoute(sessionRequest("192.0.2.11", "wrong"))).status).toBe(401);
  });

  it("DEMO_ACCESS_CODE가 없으면 503이다", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "");
    expect((await sessionRoute(sessionRequest("192.0.2.12", CODE))).status).toBe(503);
  });

  it("같은 IP의 11번째 요청은 429다", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", CODE);
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await sessionRoute(sessionRequest("192.0.2.13", CODE))).status);
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("AI로 보내는 정보 제한", () => {
  const NOW = new Date("2026-11-19T12:00:00+09:00");
  const valid = {
    policyId: "youth-rent",
    blocker: "eligibility",
    answers: { birthDate: "2001-05-10", maritalStatus: "married", ownsHouse: "unknown", youthIncome: "150" },
    checkedDocumentIds: ["bankbook"],
  };

  it("조건 값만 받고, 메모·이름·연락처가 섞이면 거절한다", () => {
    expect(aiConditionRequestSchema.safeParse(valid).success).toBe(true);
    expect(aiConditionRequestSchema.safeParse({ ...valid, note: "메모 원문" }).success).toBe(false);
    expect(aiConditionRequestSchema.safeParse({ ...valid, name: "홍길동" }).success).toBe(false);
    expect(
      aiConditionRequestSchema.safeParse({ ...valid, answers: { ...valid.answers, phone: "010" } }).success,
    ).toBe(false);
    expect(
      aiConditionRequestSchema.safeParse({ ...valid, checkedDocumentIds: ["unknown-doc"] }).success,
    ).toBe(false);
    expect(aiConditionRequestSchema.safeParse({ ...valid, policyId: "other" }).success).toBe(false);
  });

  it("AI 입력에는 판정 결과만 담고 생년월일 원값은 담지 않는다", () => {
    const parsed = aiConditionRequestSchema.parse(valid);
    const context = buildAiContext(parsed, NOW);
    const serialized = JSON.stringify(context);

    expect(serialized).not.toMatch(/2001-05-10|2001\.05\.10|05-10/);
    expect(Object.keys(context)).toEqual(["policy", "route", "application", "conditions", "missingDocuments"]);
    expect(context.conditions.find((item) => item.ruleId === "rent-age")).toMatchObject({
      status: "MET",
      reason: "2001년생은 기준(1991~2007년생) 안으로 보여요.",
    });
    // 기혼이라 원가구 조건은 해당 없음이고 AI에도 보내지 않는다.
    expect(context.conditions.map((item) => item.ruleId)).not.toContain("rent-parent-income");
    expect(context.missingDocuments).not.toContain("통장 사본");
  });

  it("브라우저가 보낸 판정은 받지 않고 서버에서 다시 계산한다", () => {
    expect(aiConditionRequestSchema.safeParse({ ...valid, route: "READY" }).success).toBe(false);
  });
});
