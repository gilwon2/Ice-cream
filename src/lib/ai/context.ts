import { z } from "zod";
import { POLICIES } from "@/data/policies";
import { diagnose } from "@/lib/diagnosis";
import { aiStatusText } from "./explainShared";

const POLICY_IDS = POLICIES.map((policy) => policy.id) as [string, ...string[]];

/**
 * AI 기능 요청 본문의 공통 형식.
 * 판정에 필요한 조건 값만 받는다. strictObject라 메모(note), 이름, 연락처 같은
 * 다른 필드가 섞이면 요청 자체를 거절한다(400).
 */
export const aiConditionRequestSchema = z
  .strictObject({
    policyId: z.enum(POLICY_IDS),
    answers: z.record(z.string().max(40), z.string().max(20)),
    checkedDocumentIds: z.array(z.string().max(60)).max(30),
  })
  .superRefine((value, context) => {
    const policy = POLICIES.find((item) => item.id === value.policyId);
    if (!policy) return;
    const questionIds = new Set(policy.questions.map((question) => question.id));
    for (const key of Object.keys(value.answers)) {
      if (!questionIds.has(key)) {
        context.addIssue({ code: "custom", path: ["answers", key], message: "알 수 없는 질문" });
      }
    }
    const documentIds = new Set(policy.documents.map((document) => document.id));
    value.checkedDocumentIds.forEach((id, index) => {
      if (!documentIds.has(id)) {
        context.addIssue({ code: "custom", path: ["checkedDocumentIds", index], message: "알 수 없는 서류" });
      }
    });
  });

export type AiConditionRequest = z.infer<typeof aiConditionRequestSchema>;

/**
 * AI에 보내는 정보. 판정 결과만 담는다.
 * 사용자 입력에서 나온 값(출생연도, 만 나이, 금액, 병역 개월 수, 가구원 수)과 메모는 담지 않는다.
 * - statusText: 화면용 reason("2001년생은 …") 대신 상태별 고정 문장
 * - criterion: 입력값(가구원 수)으로 계산한 기준이 아니라 공고 기준 문구(rule.criterion)
 */
export type AiContext = {
  policy: { id: string; name: string; benefit: string };
  route: string;
  application: { status: string; title: string };
  conditions: Array<{
    ruleId: string;
    label: string;
    status: string;
    criterion: string;
    statusText: string;
    verified: boolean;
  }>;
  missingDocuments: string[];
};

/**
 * 서버에서 판정을 다시 계산해 AI에 보낼 정보를 만든다.
 * 브라우저가 보낸 판정 결과는 믿지 않는다.
 */
export function buildAiContext(request: AiConditionRequest, now: Date): AiContext {
  const policy = POLICIES.find((item) => item.id === request.policyId);
  if (!policy) throw new Error(`알 수 없는 정책: ${request.policyId}`);

  const diagnosis = diagnose({
    policy,
    answers: request.answers,
    checkedDocumentIds: request.checkedDocumentIds,
    now,
  });

  return {
    policy: { id: policy.id, name: policy.name, benefit: policy.benefit },
    route: diagnosis.route,
    application: { status: diagnosis.application.status, title: diagnosis.application.title },
    conditions: diagnosis.conditions
      .filter((condition) => condition.status !== "NOT_APPLICABLE")
      .map((condition) => ({
        ruleId: condition.ruleId,
        label: condition.label,
        status: condition.status,
        criterion: condition.criterion,
        statusText: aiStatusText(condition.status, condition.verified),
        verified: condition.verified,
      })),
    missingDocuments: diagnosis.missingDocuments.map((document) => document.label),
  };
}
