import { z } from "zod";
import { POLICIES, type Policy } from "@/data/policies";
import { ruleInputQuestionIds, type Answers, type Rule } from "@/lib/rules";

/** 브라우저와 서버가 함께 쓰는 설명 기능 약속. 비밀 값이나 프롬프트는 두지 않는다. */

export const EXPLAIN_PATH = "/api/explain";

const POLICY_IDS = POLICIES.map((policy) => policy.id) as [string, ...string[]];

/**
 * POST /api/explain 본문. 규칙 ID와 그 규칙을 판정하는 데 필요한 조건 값만 받는다.
 * 메모, 이름, 연락처, 다른 질문의 답이 섞이면 거절한다(400).
 */
export const explainRequestSchema = z
  .strictObject({
    policyId: z.enum(POLICY_IDS),
    ruleId: z.string().min(1).max(60),
    answers: z.record(z.string().max(40), z.string().max(20)),
  })
  .superRefine((value, context) => {
    const policy = POLICIES.find((item) => item.id === value.policyId);
    const rule = policy?.rules.find((item) => item.id === value.ruleId);
    if (!rule) {
      context.addIssue({ code: "custom", path: ["ruleId"], message: "알 수 없는 규칙" });
      return;
    }
    const allowed = new Set(ruleInputQuestionIds(rule));
    for (const key of Object.keys(value.answers)) {
      if (!allowed.has(key)) {
        context.addIssue({ code: "custom", path: ["answers", key], message: "이 규칙에 필요 없는 값" });
      }
    }
  });

export type ExplainRequest = z.infer<typeof explainRequestSchema>;

/** AI가 돌려주는 형식. 판정 값이나 경로는 담지 않는다. */
export const explanationOutputSchema = z.strictObject({
  personalNote: z
    .string()
    .min(1)
    .max(300)
    .describe("이 사용자의 상황에 맞춘 한두 문장(최대 세 문장) 설명"),
});

export type ExplanationOutput = z.infer<typeof explanationOutputSchema>;

export type ExplainResponse =
  | { ok: true; personalNote: string }
  | { ok: false; reason: string; message: string };

/** 규칙에 필요한 답만 골라 요청을 만든다. 빈 답은 보내지 않는다. */
export function buildExplainRequest(policy: Policy, rule: Rule, answers: Answers): ExplainRequest {
  const relevant: Record<string, string> = {};
  for (const id of ruleInputQuestionIds(rule)) {
    const value = answers[id]?.trim();
    if (value) relevant[id] = value;
  }
  return { policyId: policy.id, ruleId: rule.id, answers: relevant };
}

/** 같은 규칙과 같은 조건 값이면 같은 키다. 다른 질문의 답은 키에 영향을 주지 않는다. */
export function explainCacheKey(request: ExplainRequest): string {
  const answers = Object.keys(request.answers)
    .sort()
    .map((key) => [key, request.answers[key]]);
  return `youth-policy.ai.explain.v1:${request.policyId}:${request.ruleId}:${JSON.stringify(answers)}`;
}
