import {
  CAUSE_CATALOG,
  type CauseCode,
  type CauseMeta,
  type Diagnosis,
  type Finding,
} from "@/lib/causes";
import type { EligibilityResult, PolicyStatus } from "@/lib/eligibility";
import type { Policy, PolicyDocument } from "@/lib/policies";

export interface PlanItem {
  policy: Policy;
  result: EligibilityResult;
  /** 이 원인에서 사용자가 해야 할 정책별 행동 또는 근거 */
  notes: string[];
}

export interface PlanGroup {
  cause: CauseCode;
  meta: CauseMeta;
  items: PlanItem[];
}

export interface PlanDocument {
  document: PolicyDocument;
  policyNames: string[];
}

export interface Plan {
  groups: PlanGroup[];
  documents: PlanDocument[];
  ineligible: PlanItem[];
  receiving: Policy[];
}

const GROUP_ORDER: CauseCode[] = [
  "READY",
  "UNAWARE",
  "MISBELIEF",
  "DOCUMENT_BURDEN",
  "PROCESS_COMPLEXITY",
  "TIME_CONSTRAINT",
  "MISSED_DEADLINE",
  "HESITATION",
  "FIXABLE_CONDITION",
  "INFO_GAP",
  "POLICY_CONFLICT",
  "NOT_OPEN",
];

const ACTIONABLE: PolicyStatus[] = ["eligible", "not_open", "fixable", "needs_check"];
const MAX_EVIDENCE_LENGTH = 120;

/**
 * AI가 보낸 원인을 판정 결과로 걸러 낸다. 대상이 아닌 정책에 원인을 붙이거나
 * 없는 정책을 지목해도 계획에 반영되지 않는다.
 */
export function sanitizeFindings(
  findings: Finding[],
  results: EligibilityResult[],
): Finding[] {
  const seen = new Set<string>();
  return findings
    .filter((finding) => {
      const result = results.find((item) => item.policyId === finding.policyId);
      const key = `${finding.policyId}:${finding.cause}`;
      if (!result || !ACTIONABLE.includes(result.status) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((finding) => ({ ...finding, evidence: finding.evidence.slice(0, MAX_EVIDENCE_LENGTH) }));
}

export function buildPlan(
  policies: Policy[],
  results: EligibilityResult[],
  diagnosis: Diagnosis | null,
): Plan {
  const findings = sanitizeFindings(diagnosis?.findings ?? [], results);
  const grouped = new Map<CauseCode, PlanItem[]>();
  const add = (cause: CauseCode, item: PlanItem) => {
    grouped.set(cause, [...(grouped.get(cause) ?? []), item]);
  };

  const ineligible: PlanItem[] = [];
  const receiving: Policy[] = [];
  const documents = new Map<string, PlanDocument>();

  for (const policy of policies) {
    const result = results.find((item) => item.policyId === policy.id);
    if (!result) continue;

    if (result.status === "already_receiving") {
      receiving.push(policy);
      continue;
    }
    if (result.status === "ineligible") {
      const reasons = result.checks.filter((check) => check.outcome === "fail");
      ineligible.push({
        policy,
        result,
        notes: reasons.map((check) => `${check.label}: ${check.detail}`),
      });
      continue;
    }

    for (const document of policy.documents) {
      const entry = documents.get(document.id) ?? { document, policyNames: [] };
      entry.policyNames.push(policy.name);
      documents.set(document.id, entry);
    }

    const policyFindings = findings.filter((finding) => finding.policyId === policy.id);
    for (const finding of policyFindings) {
      add(finding.cause, { policy, result, notes: [finding.evidence] });
    }

    const fixes = result.checks.filter((check) => check.outcome === "fixable");
    const conditionFixes = fixes.filter((check) => check.id !== "policy-conflict");
    const conflictFixes = fixes.filter((check) => check.id === "policy-conflict");
    const unknowns = result.checks.filter((check) => check.outcome === "unknown");

    if (conditionFixes.length > 0) {
      add("FIXABLE_CONDITION", {
        policy,
        result,
        notes: conditionFixes.map((check) => `${check.label}: ${check.fix}`),
      });
    }
    if (conflictFixes.length > 0) {
      add("POLICY_CONFLICT", {
        policy,
        result,
        notes: conflictFixes.map((check) => check.fix ?? check.detail),
      });
    }
    if (unknowns.length > 0) {
      add("INFO_GAP", {
        policy,
        result,
        notes: unknowns.map((check) => `${check.label}: ${check.fix}`),
      });
    }
    if (result.status === "not_open") {
      add("NOT_OPEN", { policy, result, notes: [result.windowLabel] });
    }
    if (result.status === "eligible" && policyFindings.length === 0) {
      add("READY", { policy, result, notes: [result.windowLabel] });
    }
  }

  const groups = GROUP_ORDER.flatMap((cause) => {
    const items = grouped.get(cause);
    return items ? [{ cause, meta: CAUSE_CATALOG[cause], items }] : [];
  });

  return { groups, documents: [...documents.values()], ineligible, receiving };
}
