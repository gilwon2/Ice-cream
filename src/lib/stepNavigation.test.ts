import { describe, expect, it } from "vitest";
import { furthestAfterPolicyChange, reachableStep } from "./stepNavigation";

describe("reachableStep", () => {
  it("정책을 고르지 않으면 STEP 01만 열린다", () => {
    expect(reachableStep({ hasPolicy: false, hasBlocker: false, furthest: 3 })).toBe(0);
  });

  it("막힌 지점을 고르지 않으면 STEP 02까지만 열린다", () => {
    expect(reachableStep({ hasPolicy: true, hasBlocker: false, furthest: 3 })).toBe(1);
  });

  it("막힌 지점만 고르고 STEP 03을 거치지 않았으면 STEP 04로 건너뛸 수 없다", () => {
    expect(reachableStep({ hasPolicy: true, hasBlocker: true, furthest: 1 })).toBe(1);
    expect(reachableStep({ hasPolicy: true, hasBlocker: true, furthest: 2 })).toBe(2);
  });

  it("STEP 04에 한 번 도달했으면 Stepper로 다시 이동할 수 있다", () => {
    expect(reachableStep({ hasPolicy: true, hasBlocker: true, furthest: 3 })).toBe(3);
  });

  it("정책을 바꾸면 STEP 04가 다시 잠긴다", () => {
    const furthest = furthestAfterPolicyChange(3);
    expect(reachableStep({ hasPolicy: true, hasBlocker: true, furthest })).toBe(2);
  });
});
