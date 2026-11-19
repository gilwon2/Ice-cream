import { z } from "zod";
import { POLICIES, type Policy } from "@/data/policies";
import type { RuleResult } from "@/lib/rules";

/** 브라우저와 서버가 함께 쓰는 초안 기능 약속. 비밀 값이나 프롬프트는 두지 않는다. */

export const DRAFTS_PATH = "/api/drafts";

export const DRAFT_KINDS = ["inquiry", "proposal"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

const POLICY_IDS = POLICIES.map((policy) => policy.id) as [string, ...string[]];
const MAX_CONDITIONS = 20;

/**
 * POST /api/drafts 본문.
 * 문서 종류, 정책 id, UNKNOWN·NOT_MET 조건 목록, 설명 카드를 봤는지만 받는다.
 * 입력 원값, 메모, 이름, 연락처가 섞이면 거절한다(400).
 */
export const draftRequestSchema = z
  .strictObject({
    kind: z.enum(DRAFT_KINDS),
    policyId: z.enum(POLICY_IDS),
    conditions: z
      .array(
        z.strictObject({
          ruleId: z.string().min(1).max(60),
          status: z.enum(["UNKNOWN", "NOT_MET"]),
          /** 3단계에서 이 조건의 설명 카드를 열어 봤는지 */
          explanationViewed: z.boolean(),
        }),
      )
      .min(1)
      .max(MAX_CONDITIONS),
  })
  .superRefine((value, context) => {
    const policy = POLICIES.find((item) => item.id === value.policyId);
    if (!policy) return;
    const ruleIds = new Set(policy.rules.map((rule) => rule.id));
    const seen = new Set<string>();
    value.conditions.forEach((condition, index) => {
      if (!ruleIds.has(condition.ruleId)) {
        context.addIssue({ code: "custom", path: ["conditions", index, "ruleId"], message: "알 수 없는 규칙" });
      }
      if (seen.has(condition.ruleId)) {
        context.addIssue({ code: "custom", path: ["conditions", index, "ruleId"], message: "중복된 규칙" });
      }
      seen.add(condition.ruleId);
    });
    if (value.kind === "proposal" && !value.conditions.some((condition) => condition.status === "NOT_MET")) {
      context.addIssue({ code: "custom", path: ["conditions"], message: "제안문에는 미충족 조건이 필요해요" });
    }
  });

export type DraftRequest = z.infer<typeof draftRequestSchema>;

/**
 * 스트림 형식: 한 줄에 JSON 하나(NDJSON).
 * text는 서버 검사를 통과한 문단이다. 마지막 줄은 done 또는 error다.
 */
export type DraftStreamEvent =
  | { type: "text"; text: string }
  | { type: "done"; removed: number }
  | { type: "error"; reason: string; message: string };

/** 사용자의 메모를 브라우저에서만 끼워 넣는 자리. 메모 원문은 서버로 보내지 않는다. */
export const SITUATION_PLACEHOLDER = "[상세 상황]";

/** 문의문에 넣을 조건: 직접 문의하겠다고 고른 조건, 확인 필요, 확인 중인 기준에 걸린 미충족 */
export function inquiryConditions(conditions: RuleResult[], focusRuleIds: readonly string[] = []): RuleResult[] {
  return conditions.filter(
    (condition) =>
      (condition.status === "UNKNOWN" || condition.status === "NOT_MET") &&
      (focusRuleIds.includes(condition.ruleId) || condition.status === "UNKNOWN" || !condition.verified),
  );
}

/** 제안문에 넣을 조건: 미충족 */
export function proposalConditions(conditions: RuleResult[]): RuleResult[] {
  return conditions.filter((condition) => condition.status === "NOT_MET");
}

/** 판정 결과에서 요청을 만든다. 넣을 조건이 없으면 null이다(AI를 부르지 않고 템플릿만 쓴다). */
export function buildDraftRequest(
  kind: DraftKind,
  policy: Policy,
  conditions: RuleResult[],
  viewedRuleIds: readonly string[],
  focusRuleIds: readonly string[] = [],
): DraftRequest | null {
  const selected = kind === "inquiry" ? inquiryConditions(conditions, focusRuleIds) : proposalConditions(conditions);
  if (selected.length === 0) return null;
  return {
    kind,
    policyId: policy.id,
    conditions: selected.slice(0, MAX_CONDITIONS).map((condition) => ({
      ruleId: condition.ruleId,
      status: condition.status as "UNKNOWN" | "NOT_MET",
      explanationViewed: viewedRuleIds.includes(condition.ruleId),
    })),
  };
}

export function draftCacheKey(request: DraftRequest): string {
  const conditions = [...request.conditions].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  return `youth-policy.ai.draft.v1:${request.kind}:${request.policyId}:${JSON.stringify(conditions)}`;
}

/**
 * 사용자의 메모를 자리표시에 끼워 넣는다(브라우저에서만).
 * 메모가 비어 있으면 자리표시를 그대로 둬 사용자가 직접 쓰게 한다.
 */
export function fillSituation(text: string, note: string): string {
  const trimmed = note.trim();
  if (!trimmed) return text;
  if (text.includes(SITUATION_PLACEHOLDER)) return text.split(SITUATION_PLACEHOLDER).join(trimmed);
  // 자리표시가 없으면 서명 문단 앞에 넣는다.
  const paragraphs = text.split(/\n{2,}/);
  const signature = paragraphs.findIndex((paragraph) => paragraph.includes("[이름]"));
  const at = signature === -1 ? paragraphs.length : signature;
  paragraphs.splice(at, 0, `상세 상황: ${trimmed}`);
  return paragraphs.join("\n\n");
}
