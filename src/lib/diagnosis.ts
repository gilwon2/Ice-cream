import type { Policy, RequiredDocument } from "../data/policies";

export type Blocker = "documents" | "eligibility" | "unclear";

export type Profile = {
  age: string;
  region: string;
  monthlyIncome: string;
  status: string;
};

export type DiagnosisInput = {
  policy: Policy;
  blocker: Blocker | null;
  profile: Profile;
  checkedDocumentIds: string[];
  inquiryResolved: boolean;
};

export type ConditionStatus = "MET" | "NOT_MET" | "UNKNOWN";

export type ConditionResult = {
  id: "age" | "region" | "income";
  label: string;
  status: ConditionStatus;
  criterion: string;
  detail: string;
};

export type Route = "INELIGIBLE" | "NEEDS_INQUIRY" | "ACTION_REQUIRED" | "READY";

export type ProgressItem = {
  id: string;
  label: string;
  state: "done" | "blocked" | "todo";
};

export type Diagnosis = {
  conditions: ConditionResult[];
  missingDocuments: RequiredDocument[];
  items: ProgressItem[];
  percent: number;
  remaining: number;
  route: Route;
  canApply: boolean;
};

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const WON_PER_MANWON = 10000;

/** 만 원 단위 입력을 원 단위 정수로 바꾼다. 유효하지 않으면 null을 돌려준다. */
export function manwonToWon(value: string): number | null {
  const amount = parseAmount(value);
  if (amount === null) return null;
  const won = Math.round(amount * WON_PER_MANWON);
  return Number.isSafeInteger(won) ? won : null;
}

/** 원 단위 정수를 소수 오차 없는 만 원 단위 문자열로 바꾼다. */
export function formatManwon(won: number): string {
  const manwon = Math.trunc(won / WON_PER_MANWON);
  const rest = won % WON_PER_MANWON;
  if (rest === 0) return String(manwon);
  const decimals = String(rest).padStart(4, "0").replace(/0+$/, "");
  return `${manwon}.${decimals}`;
}

function evaluateAge(policy: Policy, value: string): ConditionResult {
  const criterion = `만 ${policy.minAge}~${policy.maxAge}세`;
  const base = { id: "age", label: "연령", criterion } as const;
  const age = parseAmount(value);

  if (age === null || !Number.isInteger(age)) {
    return { ...base, status: "UNKNOWN", detail: "만 나이를 입력해 주세요" };
  }
  if (age < policy.minAge || age > policy.maxAge) {
    return { ...base, status: "NOT_MET", detail: `만 ${age}세는 기준 범위 밖으로 보여요` };
  }
  return { ...base, status: "MET", detail: `만 ${age}세는 기준 범위 안으로 보여요` };
}

function evaluateRegion(policy: Policy, region: string): ConditionResult {
  const base = { id: "region", label: "거주지", criterion: policy.regionLabel } as const;

  if (region === "") {
    return { ...base, status: "UNKNOWN", detail: "거주지역을 선택해 주세요" };
  }
  if (policy.regions !== null && !policy.regions.includes(region)) {
    return { ...base, status: "NOT_MET", detail: `${region}은(는) 대상 지역이 아닌 것으로 보여요` };
  }
  return { ...base, status: "MET", detail: `${region}은(는) 대상 지역으로 보여요` };
}

function evaluateIncome(policy: Policy, value: string): ConditionResult {
  const criterion = `월 ${policy.maxMonthlyIncome}만 원 이하`;
  const base = { id: "income", label: "월소득", criterion } as const;
  const incomeWon = manwonToWon(value);
  const limitWon = policy.maxMonthlyIncome * WON_PER_MANWON;

  if (incomeWon === null) {
    return { ...base, status: "UNKNOWN", detail: "월소득을 입력해 주세요" };
  }
  if (incomeWon > limitWon) {
    const gap = formatManwon(incomeWon - limitWon);
    return { ...base, status: "NOT_MET", detail: `기준보다 ${gap}만 원 많은 것으로 보여요` };
  }
  return {
    ...base,
    status: "MET",
    detail: `월 ${formatManwon(incomeWon)}만 원은 기준 이내로 보여요`,
  };
}

const CONDITION_STATE: Record<ConditionStatus, ProgressItem["state"]> = {
  MET: "done",
  NOT_MET: "blocked",
  UNKNOWN: "todo",
};

export function diagnose(input: DiagnosisInput): Diagnosis {
  const { policy, blocker, profile, checkedDocumentIds, inquiryResolved } = input;

  const conditions = [
    evaluateAge(policy, profile.age),
    evaluateRegion(policy, profile.region),
    evaluateIncome(policy, profile.monthlyIncome),
  ];
  const missingDocuments = policy.documents.filter(
    (document) => !checkedDocumentIds.includes(document.id),
  );
  const inquiryPending = blocker === "unclear" && !inquiryResolved;

  const items: ProgressItem[] = [
    ...conditions.map((condition) => ({
      id: condition.id,
      label: `${condition.label} 조건`,
      state: CONDITION_STATE[condition.status],
    })),
    ...(blocker === "unclear"
      ? [
          {
            id: "inquiry",
            label: "공식 기관 확인",
            state: inquiryResolved ? ("done" as const) : ("todo" as const),
          },
        ]
      : []),
    ...policy.documents.map((document) => ({
      id: document.id,
      label: document.label,
      state: checkedDocumentIds.includes(document.id) ? ("done" as const) : ("todo" as const),
    })),
  ];

  const doneCount = items.filter((item) => item.state === "done").length;
  const percent = Math.floor((doneCount / items.length) * 100);

  let route: Route = "READY";
  if (conditions.some((condition) => condition.status === "NOT_MET")) {
    route = "INELIGIBLE";
  } else if (inquiryPending || conditions.some((condition) => condition.status === "UNKNOWN")) {
    route = "NEEDS_INQUIRY";
  } else if (missingDocuments.length > 0) {
    route = "ACTION_REQUIRED";
  }

  return {
    conditions,
    missingDocuments,
    items,
    percent,
    remaining: items.length - doneCount,
    route,
    canApply: route === "READY" && percent === 100,
  };
}
