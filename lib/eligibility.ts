import type { Policy } from "@/lib/policies";
import { EMPLOYMENT_LABELS, HOUSING_LABELS, type Profile } from "@/lib/profile";

/**
 * 자격 판단 엔진. AI를 호출하지 않는 순수 함수이며,
 * 같은 입력에는 항상 같은 결과를 돌려준다.
 */

/** 프로토타입용 가구원 수별 월 기준 중위소득(만 원) 가정값 */
export const MEDIAN_INCOME_BY_HOUSEHOLD: Record<number, number> = {
  1: 256,
  2: 420,
  3: 536,
  4: 649,
  5: 756,
  6: 856,
};

export type RuleOutcome = "pass" | "fail" | "fixable" | "unknown";

export interface RuleCheck {
  id: string;
  label: string;
  outcome: RuleOutcome;
  detail: string;
  /** fixable·unknown일 때 사용자가 할 수 있는 행동 */
  fix?: string;
}

export type WindowState = "always" | "open" | "upcoming" | "closed";

export type PolicyStatus =
  | "eligible"
  | "not_open"
  | "fixable"
  | "needs_check"
  | "ineligible"
  | "already_receiving";

export interface EligibilityResult {
  policyId: string;
  status: PolicyStatus;
  checks: RuleCheck[];
  windowState: WindowState;
  windowLabel: string;
}

export function medianIncomePercent(monthlyIncome: number, householdSize: number): number {
  return Math.round((monthlyIncome / MEDIAN_INCOME_BY_HOUSEHOLD[householdSize]) * 100);
}

/** 반올림 오차로 경계값이 뒤집히지 않도록 곱셈으로 비교한다. */
function isWithinMedianLimit(monthlyIncome: number, householdSize: number, maxPercent: number) {
  return monthlyIncome * 100 <= maxPercent * MEDIAN_INCOME_BY_HOUSEHOLD[householdSize];
}

export function evaluateWindow(
  policy: Policy,
  today: string,
): { state: WindowState; label: string } {
  const { window } = policy;
  if (window.type === "always") return { state: "always", label: "상시 신청" };

  const period = `${window.start} ~ ${window.end}`;
  if (today < window.start) return { state: "upcoming", label: `${window.start} 접수 시작` };
  if (today > window.end) {
    return { state: "closed", label: policy.nextRoundNote ?? `접수 마감 (${period})` };
  }
  return { state: "open", label: `${window.end}까지 접수` };
}

function checkRules(policy: Policy, profile: Profile): RuleCheck[] {
  const rule = policy.eligibility;
  const checks: RuleCheck[] = [];

  const inAgeRange = profile.age >= rule.age.min && profile.age <= rule.age.max;
  checks.push({
    id: "age",
    label: "연령",
    outcome: inAgeRange ? "pass" : "fail",
    detail: `만 ${rule.age.min}~${rule.age.max}세 대상, 입력값 만 ${profile.age}세`,
  });

  if (rule.regions) {
    checks.push({
      id: "region",
      label: "거주 지역",
      outcome: rule.regions.includes(profile.region) ? "pass" : "fail",
      detail: `${rule.regions.join("·")} 거주자 대상, 입력값 ${profile.region}`,
    });
  }

  if (rule.minResidencyMonths !== undefined) {
    const remaining = rule.minResidencyMonths - profile.residencyMonths;
    checks.push({
      id: "residency",
      label: "거주 기간",
      outcome: remaining <= 0 ? "pass" : "fixable",
      detail: `${rule.minResidencyMonths}개월 이상 거주 필요, 입력값 ${profile.residencyMonths}개월`,
      fix: remaining > 0 ? `${remaining}개월 더 거주하면 요건을 채웁니다. 충족 시점을 달력에 기록해 두세요.` : undefined,
    });
  }

  if (rule.employment) {
    checks.push({
      id: "employment",
      label: "취업 상태",
      outcome: rule.employment.includes(profile.employment) ? "pass" : "fail",
      detail: `${rule.employment.map((value) => EMPLOYMENT_LABELS[value]).join("·")} 대상, 입력값 ${EMPLOYMENT_LABELS[profile.employment]}`,
    });
  }

  if (rule.maxMedianIncomePercent !== undefined) {
    const income = profile.householdMonthlyIncome;
    if (income === null) {
      checks.push({
        id: "household-income",
        label: "가구 소득",
        outcome: "unknown",
        detail: `기준 중위소득 ${rule.maxMedianIncomePercent}% 이하 대상, 가구 소득 미입력`,
        fix: "건강보험료 납부확인서나 소득금액증명원으로 가구 소득을 확인한 뒤 프로필을 수정하세요.",
      });
    } else {
      checks.push({
        id: "household-income",
        label: "가구 소득",
        outcome: isWithinMedianLimit(income, profile.householdSize, rule.maxMedianIncomePercent)
          ? "pass"
          : "fail",
        detail: `기준 중위소득 ${rule.maxMedianIncomePercent}% 이하 대상, 입력값 약 ${medianIncomePercent(income, profile.householdSize)}%`,
      });
    }
  }

  if (rule.maxPersonalAnnualIncome !== undefined) {
    const income = profile.personalAnnualIncome;
    if (income === null) {
      checks.push({
        id: "personal-income",
        label: "본인 소득",
        outcome: "unknown",
        detail: `연 ${rule.maxPersonalAnnualIncome.toLocaleString("ko-KR")}만 원 이하 대상, 본인 소득 미입력`,
        fix: "홈택스에서 소득금액증명원을 발급해 연 소득을 확인한 뒤 프로필을 수정하세요.",
      });
    } else {
      checks.push({
        id: "personal-income",
        label: "본인 소득",
        outcome: income <= rule.maxPersonalAnnualIncome ? "pass" : "fail",
        detail: `연 ${rule.maxPersonalAnnualIncome.toLocaleString("ko-KR")}만 원 이하 대상, 입력값 ${income.toLocaleString("ko-KR")}만 원`,
      });
    }
  }

  if (rule.housing) {
    checks.push({
      id: "housing",
      label: "주거 형태",
      outcome: rule.housing.includes(profile.housing) ? "pass" : "fail",
      detail: `${rule.housing.map((value) => HOUSING_LABELS[value]).join("·")} 대상, 입력값 ${HOUSING_LABELS[profile.housing]}`,
    });
  }

  if (rule.maxMonthlyRent !== undefined && profile.housing === "monthly_rent") {
    checks.push({
      id: "monthly-rent",
      label: "월세 금액",
      outcome: profile.monthlyRent <= rule.maxMonthlyRent ? "pass" : "fail",
      detail: `월 ${rule.maxMonthlyRent}만 원 이하 대상, 입력값 ${profile.monthlyRent}만 원`,
    });
  }

  if (rule.maxDeposit !== undefined && profile.housing === "monthly_rent") {
    checks.push({
      id: "deposit",
      label: "보증금",
      outcome: profile.deposit <= rule.maxDeposit ? "pass" : "fail",
      detail: `${rule.maxDeposit.toLocaleString("ko-KR")}만 원 이하 대상, 입력값 ${profile.deposit.toLocaleString("ko-KR")}만 원`,
    });
  }

  if (rule.noHomeOwnership) {
    checks.push({
      id: "home-ownership",
      label: "주택 소유",
      outcome: profile.housing === "owned" ? "fail" : "pass",
      detail: "무주택자 대상",
    });
  }

  if (rule.requiresIndependentHousehold) {
    const value = profile.independentHousehold;
    checks.push({
      id: "independent-household",
      label: "세대 분리",
      outcome: value === "yes" ? "pass" : value === "no" ? "fixable" : "unknown",
      detail: "부모와 주민등록상 세대가 분리되어 있어야 합니다.",
      fix:
        value === "no"
          ? "주민센터나 정부24에서 세대 분리 가능 여부를 확인하고 신고하세요."
          : value === "unknown"
            ? "정부24에서 주민등록등본을 발급해 세대주와 세대원을 확인하세요."
            : undefined,
    });
  }

  if (rule.requiresResidentRegistration) {
    const value = profile.residentRegistered;
    checks.push({
      id: "resident-registration",
      label: "전입신고",
      outcome: value === "yes" ? "pass" : value === "no" ? "fixable" : "unknown",
      detail: "현재 거주지에 전입신고가 되어 있어야 합니다.",
      fix:
        value === "no"
          ? "주민센터나 정부24에서 현재 주소로 전입신고를 하세요."
          : value === "unknown"
            ? "주민등록등본의 주소가 현재 거주지와 같은지 확인하세요."
            : undefined,
    });
  }

  const conflicts = (rule.excludesPolicies ?? []).filter((id) =>
    profile.receivingPolicyIds.includes(id),
  );
  if (rule.excludesPolicies?.length) {
    checks.push({
      id: "policy-conflict",
      label: "중복 수혜",
      outcome: conflicts.length > 0 ? "fixable" : "pass",
      detail:
        conflicts.length > 0
          ? "현재 받고 있는 정책과 동시에 받을 수 없습니다."
          : "동시에 받을 수 없는 정책을 이용하고 있지 않습니다.",
      fix:
        conflicts.length > 0
          ? "두 정책의 혜택을 비교하고, 현재 정책이 끝난 뒤 신청할지 결정하세요."
          : undefined,
    });
  }

  return checks;
}

export function evaluatePolicy(
  policy: Policy,
  profile: Profile,
  today: string,
): EligibilityResult {
  const checks = checkRules(policy, profile);
  const { state: windowState, label: windowLabel } = evaluateWindow(policy, today);
  const has = (outcome: RuleOutcome) => checks.some((check) => check.outcome === outcome);
  const isOpen = windowState === "always" || windowState === "open";

  let status: PolicyStatus;
  if (profile.receivingPolicyIds.includes(policy.id)) status = "already_receiving";
  else if (has("fail")) status = "ineligible";
  else if (has("unknown")) status = "needs_check";
  else if (has("fixable")) status = "fixable";
  else if (!isOpen) status = "not_open";
  else status = "eligible";

  return { policyId: policy.id, status, checks, windowState, windowLabel };
}

export function evaluateAll(
  policies: Policy[],
  profile: Profile,
  today: string,
): EligibilityResult[] {
  return policies.map((policy) => evaluatePolicy(policy, profile, today));
}

/** 한국 시간 기준 오늘 날짜(YYYY-MM-DD) */
export function todayInKorea(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}
