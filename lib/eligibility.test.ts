import { describe, expect, it } from "vitest";
import { evaluateAll, evaluatePolicy, evaluateWindow, todayInKorea } from "@/lib/eligibility";
import { buildPlan, sanitizeFindings } from "@/lib/plan";
import { getPolicy, policies } from "@/lib/policies";
import type { Profile } from "@/lib/profile";

const TODAY = "2026-11-18";

const base: Profile = {
  age: 26,
  region: "대구",
  residencyMonths: 24,
  employment: "unemployed",
  householdSize: 1,
  householdMonthlyIncome: 120,
  personalAnnualIncome: 1200,
  housing: "monthly_rent",
  monthlyRent: 45,
  deposit: 500,
  independentHousehold: "yes",
  residentRegistered: "yes",
  receivingPolicyIds: [],
};

function status(policyId: string, overrides: Partial<Profile> = {}, today = TODAY) {
  return evaluatePolicy(getPolicy(policyId)!, { ...base, ...overrides }, today).status;
}

describe("정책 데이터", () => {
  it("가짜 정책 6개를 불러온다", () => {
    expect(policies).toHaveLength(6);
  });
});

describe("자격 판단", () => {
  it("모든 요건을 충족하고 접수 중이면 eligible", () => {
    expect(status("rent-support")).toBe("eligible");
  });

  it("연령 경계값을 포함해서 판단한다", () => {
    expect(status("rent-support", { age: 19 })).toBe("eligible");
    expect(status("rent-support", { age: 34 })).toBe("eligible");
    expect(status("rent-support", { age: 18 })).toBe("ineligible");
    expect(status("rent-support", { age: 35 })).toBe("ineligible");
  });

  it("중위소득 기준 경계값을 정확히 비교한다", () => {
    // 1인 가구 256만 원의 60%는 153.6만 원
    expect(status("rent-support", { householdMonthlyIncome: 153.6 })).toBe("eligible");
    expect(status("rent-support", { householdMonthlyIncome: 153.7 })).toBe("ineligible");
  });

  it("가구원 수에 따라 소득 기준이 달라진다", () => {
    expect(status("rent-support", { householdMonthlyIncome: 200 })).toBe("ineligible");
    expect(status("rent-support", { householdMonthlyIncome: 200, householdSize: 2 })).toBe("eligible");
  });

  it("소득을 모르면 needs_check", () => {
    expect(status("rent-support", { householdMonthlyIncome: null })).toBe("needs_check");
  });

  it("전입신고와 세대 분리는 보완 가능한 요건이다", () => {
    expect(status("rent-support", { residentRegistered: "no" })).toBe("fixable");
    expect(status("rent-support", { independentHousehold: "no" })).toBe("fixable");
    expect(status("rent-support", { independentHousehold: "unknown" })).toBe("needs_check");
  });

  it("보완할 수 없는 탈락 사유가 있으면 ineligible이 우선한다", () => {
    expect(status("rent-support", { age: 40, residentRegistered: "no" })).toBe("ineligible");
  });

  it("지역 요건과 거주 기간을 구분한다", () => {
    expect(status("dalbit-settlement", { region: "부산" })).toBe("ineligible");
    expect(status("dalbit-settlement", { residencyMonths: 5 })).toBe("fixable");
    expect(status("dalbit-settlement", { residencyMonths: 6 })).toBe("eligible");
  });

  it("중복 수혜 정책을 이용 중이면 보완 대상으로 분류한다", () => {
    expect(status("job-leap-allowance", { receivingPolicyIds: ["startup-first-step"] })).toBe("fixable");
  });

  it("이미 받고 있는 정책은 already_receiving", () => {
    expect(status("mind-care-voucher", { receivingPolicyIds: ["mind-care-voucher"] })).toBe("already_receiving");
  });

  it("요건을 충족해도 접수 기간이 아니면 not_open", () => {
    expect(status("startup-first-step")).toBe("not_open");
    expect(status("future-savings", { employment: "employed" })).toBe("not_open");
  });

  it("접수 시작일과 마감일 당일은 접수 중이다", () => {
    const policy = getPolicy("startup-first-step")!;
    expect(evaluateWindow(policy, "2027-03-01").state).toBe("upcoming");
    expect(evaluateWindow(policy, "2027-03-02").state).toBe("open");
    expect(evaluateWindow(policy, "2027-04-30").state).toBe("open");
    expect(evaluateWindow(policy, "2027-05-01").state).toBe("closed");
  });

  it("같은 입력에는 항상 같은 결과를 돌려준다", () => {
    expect(evaluateAll(policies, base, TODAY)).toEqual(evaluateAll(policies, base, TODAY));
  });

  it("한국 시간 기준으로 오늘 날짜를 계산한다", () => {
    expect(todayInKorea(new Date("2026-11-18T15:30:00Z"))).toBe("2026-11-19");
  });
});

describe("행동 계획", () => {
  const results = evaluateAll(policies, base, TODAY);

  it("AI는 대상이 아닌 정책이나 없는 정책에 원인을 붙일 수 없다", () => {
    const cleaned = sanitizeFindings(
      [
        { policyId: "future-savings", cause: "UNAWARE", evidence: "대상 아님" },
        { policyId: "no-such-policy", cause: "UNAWARE", evidence: "없는 정책" },
        { policyId: "rent-support", cause: "DOCUMENT_BURDEN", evidence: "서류가 어렵다" },
        { policyId: "rent-support", cause: "DOCUMENT_BURDEN", evidence: "중복" },
      ],
      results,
    );
    expect(cleaned).toEqual([
      { policyId: "rent-support", cause: "DOCUMENT_BURDEN", evidence: "서류가 어렵다" },
    ]);
  });

  it("AI 진단이 없어도 판정 결과만으로 계획을 만든다", () => {
    const plan = buildPlan(policies, results, null);
    expect(plan.groups.map((group) => group.cause)).toContain("READY");
    expect(plan.ineligible.map((item) => item.policy.id)).toContain("future-savings");
  });

  it("여러 정책에 쓰이는 서류는 체크리스트에 한 번만 나온다", () => {
    const plan = buildPlan(policies, results, null);
    const ids = plan.documents.map((item) => item.document.id);
    expect(new Set(ids).size).toBe(ids.length);
    const record = plan.documents.find((item) => item.document.id === "resident-record");
    expect(record!.policyNames.length).toBeGreaterThan(1);
  });
});
