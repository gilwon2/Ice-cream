import { z } from "zod";

/** 대화에서 AI가 분류할 수 있는 원인. 자격 여부는 여기에 포함되지 않는다. */
export const CONVERSATION_CAUSES = [
  "UNAWARE",
  "MISBELIEF",
  "DOCUMENT_BURDEN",
  "PROCESS_COMPLEXITY",
  "TIME_CONSTRAINT",
  "MISSED_DEADLINE",
  "HESITATION",
] as const;

/** 자격 판단 함수의 결과에서만 만들어지는 원인 */
export const RULE_CAUSES = [
  "READY",
  "FIXABLE_CONDITION",
  "INFO_GAP",
  "POLICY_CONFLICT",
  "NOT_OPEN",
] as const;

export type ConversationCause = (typeof CONVERSATION_CAUSES)[number];
export type RuleCause = (typeof RULE_CAUSES)[number];
export type CauseCode = ConversationCause | RuleCause;

export interface CauseMeta {
  title: string;
  description: string;
  steps: string[];
}

export const CAUSE_CATALOG: Record<CauseCode, CauseMeta> = {
  READY: {
    title: "지금 바로 신청할 수 있어요",
    description: "입력한 프로필 기준으로 요건을 모두 충족했고 접수 기간도 열려 있습니다.",
    steps: ["서류 체크리스트를 보며 서류를 준비하세요.", "신청 페이지에서 접수를 마치세요."],
  },
  FIXABLE_CONDITION: {
    title: "요건을 보완하면 신청할 수 있어요",
    description: "지금은 조건이 부족하지만 직접 해결할 수 있는 항목입니다.",
    steps: [],
  },
  INFO_GAP: {
    title: "확인이 더 필요해요",
    description: "입력하지 않았거나 모르는 정보가 있어 자격을 확정하지 못했습니다.",
    steps: ["아래 항목을 확인한 뒤 프로필을 수정하면 결과가 다시 계산됩니다."],
  },
  POLICY_CONFLICT: {
    title: "다른 정책과 겹쳐요",
    description: "지금 받는 정책과 동시에 받을 수 없어 선택이 필요합니다.",
    steps: [],
  },
  NOT_OPEN: {
    title: "접수 기간을 기다려야 해요",
    description: "요건은 충족했지만 지금은 접수 기간이 아닙니다.",
    steps: ["접수 시작일을 달력에 등록하세요.", "시작 전에 서류를 미리 준비해 두세요."],
  },
  UNAWARE: {
    title: "정책이 있는 줄 몰랐어요",
    description: "정보가 닿지 않아 신청 기회 자체를 놓친 경우입니다.",
    steps: ["아래 정책의 혜택과 접수 기간을 먼저 살펴보세요.", "관심 있는 정책의 신청 페이지를 저장해 두세요."],
  },
  MISBELIEF: {
    title: "대상이 아니라고 생각했어요",
    description: "실제 기준과 알고 있던 내용이 달라 신청을 포기한 경우입니다.",
    steps: ["아래 판정 근거를 실제 기준과 비교해 보세요.", "조건을 확인했다면 신청을 시작하세요."],
  },
  DOCUMENT_BURDEN: {
    title: "서류 준비가 막막해요",
    description: "어떤 서류를 어디서 받는지 몰라 신청이 멈춘 경우입니다.",
    steps: ["체크리스트의 온라인 발급 서류부터 처리하세요.", "여러 정책에 쓰이는 서류를 한 번에 발급하세요."],
  },
  PROCESS_COMPLEXITY: {
    title: "신청 절차가 복잡해요",
    description: "절차가 길고 어려워 중간에 포기한 경우입니다.",
    steps: ["오늘은 서류 한 가지만 준비하는 것으로 시작하세요.", "막히는 단계는 운영 기관에 문의하세요."],
  },
  TIME_CONSTRAINT: {
    title: "신청할 시간이 없어요",
    description: "일이나 구직 활동 때문에 시간을 내기 어려운 경우입니다.",
    steps: ["이번 주에 30분을 달력에 비워 두세요.", "온라인 발급 서류로 방문 없이 준비하세요."],
  },
  MISSED_DEADLINE: {
    title: "접수 기간을 놓쳤어요",
    description: "일정을 챙기지 못해 신청 시기를 지나친 경우입니다.",
    steps: ["마감일 일주일 전 알림을 설정하세요.", "다음 접수에 대비해 서류를 미리 모아 두세요."],
  },
  HESITATION: {
    title: "신청하기가 망설여져요",
    description: "떨어질까 걱정되거나 지원받는 것이 부담스러운 경우입니다.",
    steps: ["판정 근거로 요건을 충족했는지 먼저 확인하세요.", "부담이 적은 정책 하나부터 신청해 보세요."],
  },
};

export const findingSchema = z.object({
  policyId: z.string().describe("정책 id"),
  cause: z.enum(CONVERSATION_CAUSES).describe("대화에서 확인한 원인 코드"),
  evidence: z.string().describe("사용자 발언을 바탕으로 쓴 근거 한 문장(100자 이내)"),
});

export const diagnosisSchema = z.object({
  summary: z.string().describe("진단 결과를 사용자에게 설명하는 두 문장 이내 요약"),
  findings: z.array(findingSchema),
});

export type Finding = z.infer<typeof findingSchema>;
export type Diagnosis = z.infer<typeof diagnosisSchema>;
