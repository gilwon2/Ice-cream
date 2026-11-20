import { z } from "zod";
import { POLICIES, type Policy } from "@/data/policies";
import { evaluationContext } from "@/lib/diagnosis";
import {
  UNKNOWN_ANSWER,
  evaluateRule,
  ruleInputQuestionIds,
  type Answers,
  type Rule,
  type RuleStatus,
} from "@/lib/rules";

/** 브라우저와 서버가 함께 쓰는 설명 기능 약속. 비밀 값이나 프롬프트는 두지 않는다. */

/**
 * AI에 보내는 판정 상태 문장. 입력값이 들어간 화면용 reason 대신 쓴다.
 * 확인 중인 기준(verified: false)의 미충족은 확정하지 않는다.
 */
export function aiStatusText(status: RuleStatus, verified: boolean): string {
  switch (status) {
    case "MET":
      return "기준 안으로 보임";
    case "NOT_MET":
      return verified ? "기준 밖으로 보임" : "기준 밖으로 보이나 확인 중인 기준이라 확인 필요";
    case "UNKNOWN":
      return "확인 필요";
    case "NOT_APPLICABLE":
      return "해당 없음";
  }
}

/** 질문 하나의 입력 상태. 값 자체는 담지 않는다. */
export type AnswerState = "입력함" | "모르겠어요" | "미입력";

function answerState(raw: string | undefined): AnswerState {
  const value = (raw ?? "").trim();
  if (value === "") return "미입력";
  return value === UNKNOWN_ANSWER ? "모르겠어요" : "입력함";
}

/** AI 설명을 정하는 값: 규칙, 질문별 입력 상태, 판정 상태. 입력 원값은 없다. */
export type ExplainSignature = {
  ruleId: string;
  inputs: Array<{ questionId: string; label: string; state: AnswerState }>;
  status: RuleStatus;
  verified: boolean;
};

/** 요청의 입력값으로 판정을 계산하되, 결과에는 입력 상태와 판정 상태만 남긴다. */
export function explainSignature(request: ExplainRequest, now: Date): ExplainSignature {
  const policy = POLICIES.find((item) => item.id === request.policyId);
  const rule = policy?.rules.find((item) => item.id === request.ruleId);
  if (!policy || !rule) throw new Error(`알 수 없는 규칙: ${request.ruleId}`);

  const ids = ruleInputQuestionIds(rule);
  const answers: Answers = Object.fromEntries(ids.map((id) => [id, request.answers[id] ?? ""]));
  const result = evaluateRule(rule, evaluationContext(policy, answers, now));
  const inputs = ids.flatMap((id) => {
    const question = policy.questions.find((item) => item.id === id);
    return question ? [{ questionId: id, label: question.label, state: answerState(answers[id]) }] : [];
  });
  return { ruleId: rule.id, inputs, status: result.status, verified: rule.verified };
}

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

/**
 * sessionStorage 키. AI 설명은 규칙·입력 상태·판정 상태로만 정해지므로 키도 같은 기준이다.
 * 입력 원값(생년월일, 금액 등)은 키에 넣지 않는다. 조건 값이 달라도 상태가 같으면 같은 키다.
 */
export function explainCacheKey(request: ExplainRequest, now: Date = new Date()): string {
  const { ruleId, inputs, status } = explainSignature(request, now);
  const states = inputs.map((input) => [input.questionId, input.state]);
  return `youth-policy.ai.explain.v2:${request.policyId}:${ruleId}:${status}:${JSON.stringify(states)}`;
}
