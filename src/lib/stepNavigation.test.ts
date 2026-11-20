import { describe, expect, it } from "vitest";
import { furthestAfterPolicyChange, reachableStep, RESULT_STEP } from "./stepNavigation";

describe("reachableStep", () => {
  it("3단계(정책 선택, 상황 확인, 해결 안내)이고 해결 안내는 마지막 단계다", () => {
    expect(RESULT_STEP).toBe(2);
  });

  it("정책을 고르지 않으면 STEP 01만 열린다", () => {
    expect(reachableStep({ hasPolicy: false, furthest: 2 })).toBe(0);
  });

  it("정책을 고르면 STEP 02(상황 확인)가 열린다", () => {
    expect(reachableStep({ hasPolicy: true, furthest: 0 })).toBe(1);
    expect(reachableStep({ hasPolicy: true, furthest: 1 })).toBe(1);
  });

  it("STEP 03에 한 번 도달했으면 Stepper로 다시 이동할 수 있다", () => {
    expect(reachableStep({ hasPolicy: true, furthest: 2 })).toBe(2);
  });

  it("정책을 바꾸면 STEP 03이 다시 잠긴다", () => {
    const furthest = furthestAfterPolicyChange(2);
    expect(reachableStep({ hasPolicy: true, furthest })).toBe(1);
  });
});
