import { isConfirmedNotMet, type Diagnosis } from "@/lib/diagnosis";

/**
 * 해결 안내에서 고를 수 있는 다음 행동.
 * - inquiry: 기관에 문의하기(문의문 + 전화)
 * - proposal: 정책 개선 건의하기(건의문 + 청년신문고)
 * - prepare: 신청 준비(서류 체크리스트 + 공식 신청 사이트)
 */
export type NextActionId = "inquiry" | "proposal" | "prepare";

export type NextActionPlan = {
  /** 보여줄 순서. 첫 번째가 추천이다. */
  options: NextActionId[];
  recommended: NextActionId;
  /**
   * 문의문에 함께 넣을 조건.
   * 확인된 기준에 맞지 않을 때는 "기준을 다시 확인"하도록 그 조건을 문의 대상으로 넣는다.
   */
  inquiryFocusRuleIds: string[];
};

/**
 * 판정 결과로 다음 행동을 정한다. 판정은 하지 않고 diagnose()의 경로만 읽는다.
 * - 확인된 기준 미충족(INELIGIBLE): 기준 재확인 문의를 추천, 정책 개선 건의는 선택
 * - 확인 필요(NEEDS_INQUIRY): 문의 추천, 신청 준비도 선택 가능
 * - 서류 부족·준비 완료: 신청 준비 추천, 문의도 선택 가능
 * 정책 개선 건의는 확인된 미충족이 있을 때만 둔다(확인 중인 기준에 건의하지 않도록).
 */
export function nextActions(diagnosis: Diagnosis): NextActionPlan {
  const confirmedNotMet = diagnosis.conditions.filter(isConfirmedNotMet);

  if (diagnosis.route === "INELIGIBLE") {
    return {
      options: ["inquiry", "proposal"],
      recommended: "inquiry",
      inquiryFocusRuleIds: confirmedNotMet.map((condition) => condition.ruleId),
    };
  }
  if (diagnosis.route === "NEEDS_INQUIRY") {
    return { options: ["inquiry", "prepare"], recommended: "inquiry", inquiryFocusRuleIds: [] };
  }
  return { options: ["prepare", "inquiry"], recommended: "prepare", inquiryFocusRuleIds: [] };
}
