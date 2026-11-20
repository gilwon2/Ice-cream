import { isConfirmedNotMet, type Diagnosis } from "@/lib/diagnosis";
import type { RuleResult, RuleStatus } from "@/lib/rules";

/**
 * 결과 화면 표시용 분류. 판정은 하지 않고 규칙 엔진이 낸 결과만 묶고 정렬한다.
 */

export const STATUS_LABEL: Record<RuleStatus, string> = {
  MET: "충족으로 보임",
  NOT_MET: "미충족으로 보임",
  UNKNOWN: "확인 필요",
  NOT_APPLICABLE: "해당 없음",
};

/**
 * 화면에 보여줄 상태.
 * 진단 경로와 같은 기준(isConfirmedNotMet)을 써서, 확인 중인 기준의 미충족은 확인 필요로 보여준다.
 */
export function displayStatus(condition: RuleResult): RuleStatus {
  if (condition.status === "NOT_MET" && !isConfirmedNotMet(condition)) return "UNKNOWN";
  return condition.status;
}

export type ConditionCounts = { met: number; notMet: number; unknown: number };

/** 해당 없는 조건을 뺀 충족·미충족·확인 필요 개수 */
export function countConditions(conditions: RuleResult[]): ConditionCounts {
  const counts: ConditionCounts = { met: 0, notMet: 0, unknown: 0 };
  for (const condition of conditions) {
    const status = displayStatus(condition);
    if (status === "MET") counts.met += 1;
    else if (status === "NOT_MET") counts.notMet += 1;
    else if (status === "UNKNOWN") counts.unknown += 1;
  }
  return counts;
}

export type ProgressSummary = {
  /** 자격 확인: 개수로만 보여준다. 미충족이 있는데 높은 퍼센트가 보이지 않도록 퍼센트를 두지 않는다. */
  eligibility: ConditionCounts & { total: number };
  /** 신청 준비: 퍼센트는 서류 준비에만 쓴다. */
  documents: { done: number; total: number; percent: number };
};

/**
 * 사이드바·모바일 상단 바·결과 요약 카드가 같은 숫자를 보이도록 하는 표시용 요약.
 * 자격 개수는 결과 요약 카드와 같은 countConditions를 그대로 쓴다.
 */
export function progressSummary(
  diagnosis: Pick<Diagnosis, "conditions" | "documents" | "missingDocuments">,
): ProgressSummary {
  const counts = countConditions(diagnosis.conditions);
  const total = diagnosis.documents.length;
  const done = total - diagnosis.missingDocuments.length;
  return {
    eligibility: { ...counts, total: counts.met + counts.notMet + counts.unknown },
    documents: { done, total, percent: total === 0 ? 0 : Math.floor((done / total) * 100) },
  };
}

/** 모바일 상단 바용 한 줄 요약. 예: "자격 8/9 · 서류 0/3" */
export function compactProgressLabel(summary: ProgressSummary): string {
  const { eligibility, documents } = summary;
  return `자격 ${eligibility.met}/${eligibility.total} · 서류 ${documents.done}/${documents.total}`;
}

/** 화면 읽기 프로그램용 전체 요약 */
export function progressDescription(summary: ProgressSummary): string {
  const { eligibility, documents } = summary;
  return (
    `자격 확인: 충족 ${eligibility.met}개, 미충족 가능성 ${eligibility.notMet}개, 확인 필요 ${eligibility.unknown}개. ` +
    `신청 준비: 서류 ${documents.total}개 중 ${documents.done}개 완료.`
  );
}

export type EligibilityItem = {
  id: string;
  label: string;
  status: Exclude<RuleStatus, "NOT_APPLICABLE">;
};

/** 사이드바 자격 확인 목록: 해당 없음은 빼고, 상태는 결과 화면과 같은 displayStatus를 쓴다. */
export function eligibilityItems(conditions: RuleResult[]): EligibilityItem[] {
  const items: EligibilityItem[] = [];
  for (const condition of conditions) {
    const status = displayStatus(condition);
    if (status === "NOT_APPLICABLE") continue;
    items.push({ id: condition.ruleId, label: condition.label, status });
  }
  return items;
}

const ORDER: Record<RuleStatus, number> = { NOT_MET: 0, UNKNOWN: 1, MET: 2, NOT_APPLICABLE: 3 };

/** 미충족 → 확인 필요 → 충족 → 해당 없음. 같은 상태 안에서는 원래 순서를 지킨다. */
export function orderConditions(conditions: RuleResult[]): RuleResult[] {
  return conditions
    .map((condition, index) => ({ condition, index }))
    .sort(
      (a, b) =>
        ORDER[displayStatus(a.condition)] - ORDER[displayStatus(b.condition)] || a.index - b.index,
    )
    .map(({ condition }) => condition);
}

/** 막힌 조건 카드를 처음에 몇 개까지 보여줄지 */
export const ATTENTION_PREVIEW_COUNT = 3;

/**
 * 목록이 limit보다 길면 처음 limit개만 보이고 나머지는 접는다.
 * limit+1개 이상일 때만 접는다(4개 이상이면 3개 + "나머지 n개 더 보기").
 */
export function splitVisible<T>(items: T[], limit = ATTENTION_PREVIEW_COUNT): { visible: T[]; hidden: T[] } {
  if (items.length <= limit) return { visible: items, hidden: [] };
  return { visible: items.slice(0, limit), hidden: items.slice(limit) };
}

/**
 * 결과 화면에서 먼저 보여줄 조건(미충족·확인 필요)과 접어 둘 조건(충족·해당 없음)으로 나눈다.
 * 막힌 조건을 먼저 보게 하려는 표시용 분류라 판정은 바꾸지 않고, 각 목록은 orderConditions 순서를 따른다.
 */
export function splitConditions(conditions: RuleResult[]): {
  attention: RuleResult[];
  settled: RuleResult[];
} {
  const ordered = orderConditions(conditions);
  const needsAttention = (condition: RuleResult) => {
    const status = displayStatus(condition);
    return status === "NOT_MET" || status === "UNKNOWN";
  };
  return {
    attention: ordered.filter(needsAttention),
    settled: ordered.filter((condition) => !needsAttention(condition)),
  };
}
