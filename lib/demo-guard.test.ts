import { describe, expect, it } from "vitest";
import { encodeAccessCode } from "./access-code";
import { clientIp, createRateLimiter, hasValidAccessCode, isAccessCodeRequired } from "./demo-guard";

describe("hasValidAccessCode", () => {
  it("코드가 설정되지 않았으면 헤더 없이 통과한다", () => {
    expect(hasValidAccessCode(undefined, null)).toBe(true);
    expect(hasValidAccessCode("", null)).toBe(true);
    expect(hasValidAccessCode("   ", null)).toBe(true);
  });

  it("코드가 설정되면 일치할 때만 통과한다", () => {
    expect(hasValidAccessCode("demo-2026", "demo-2026")).toBe(true);
    expect(hasValidAccessCode("demo-2026", "wrong")).toBe(false);
    expect(hasValidAccessCode("demo-2026", "")).toBe(false);
    expect(hasValidAccessCode("demo-2026", null)).toBe(false);
  });

  it("인코딩된 한글 코드를 비교한다", () => {
    expect(hasValidAccessCode("아이스크림", encodeAccessCode("아이스크림"))).toBe(true);
    expect(hasValidAccessCode("아이스크림", encodeAccessCode("아이스"))).toBe(false);
  });

  it("잘못 인코딩된 헤더도 오류 없이 거절한다", () => {
    expect(hasValidAccessCode("demo", "%E0%A4%A")).toBe(false);
  });
});

describe("isAccessCodeRequired", () => {
  it("공백뿐인 값은 설정되지 않은 것으로 본다", () => {
    expect(isAccessCodeRequired("  ")).toBe(false);
    expect(isAccessCodeRequired("demo")).toBe(true);
  });
});

describe("clientIp", () => {
  it("프록시가 마지막에 추가한 주소를 사용한다", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(clientIp(headers)).toBe("2.2.2.2");
  });

  it("주소를 알 수 없으면 하나의 묶음으로 처리한다", () => {
    expect(clientIp(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("createRateLimiter", () => {
  const options = { limit: 10, windowMs: 60_000 };

  it("1분에 10회까지 허용하고 11번째를 막는다", () => {
    const check = createRateLimiter(options);
    for (let count = 0; count < 10; count += 1) {
      expect(check("ip", 1_000).allowed).toBe(true);
    }
    expect(check("ip", 1_000)).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("1분이 지나면 다시 허용한다", () => {
    const check = createRateLimiter(options);
    for (let count = 0; count < 11; count += 1) check("ip", 0);
    expect(check("ip", 59_999).allowed).toBe(false);
    expect(check("ip", 60_000).allowed).toBe(true);
  });

  it("IP별로 따로 계산한다", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(check("a", 0).allowed).toBe(true);
    expect(check("a", 0).allowed).toBe(false);
    expect(check("b", 0).allowed).toBe(true);
  });

  it("저장하는 IP 수가 상한을 넘지 않도록 오래된 항목을 지운다", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    check("a", 0);
    check("b", 0);
    check("c", 0);
    expect(check("c", 0).allowed).toBe(false);
    expect(check("a", 0).allowed).toBe(true);
  });
});
