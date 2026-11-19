import type { Policy } from "../data/policies";
import type { ConditionResult } from "./diagnosis";

export function buildProposalDraft(
  policy: Policy,
  conditions: ConditionResult[],
  note: string,
): string {
  const unmet = conditions
    .filter((condition) => condition.status === "NOT_MET")
    .map((condition) => `- ${condition.label}: 기준 ${condition.criterion} (${condition.detail})`)
    .join("\n");
  const situation =
    note.trim() || "[지원이 필요한 실제 상황과 생활비 부담을 직접 작성해 주세요.]";

  return `제목: ${policy.name} 기준의 사각지대 보완 제안

1. 제안 배경
지원의 필요성을 느끼고 있으나 아래 자격요건을 충족하지 못하는 것으로 보여 신청이 어려운 상황입니다.
${unmet}

2. 제안 내용
${situation}

위와 같은 상황의 청년도 지원 대상에 포함될 수 있도록 기준의 보완을 검토해 주시기 바랍니다.

3. 실현 가능성 및 기대 효과
기준을 일부 조정하거나 실제 부담을 함께 고려하는 방안을 검토할 수 있습니다. 이를 통해 지원이 필요한 청년이 제도에서 제외되는 사례를 줄이는 데 도움이 될 것으로 기대합니다.`;
}

export function buildInquiryDraft(policy: Policy, topic: string, note: string): string {
  const subject = topic || "그 밖의 자격조건";
  const situation = note.trim() || "[현재 상황을 직접 작성해 주세요.]";

  return `안녕하세요.
${policy.name} 신청 자격과 관련하여 문의드립니다.

확인이 필요한 항목: ${subject}
상세 상황: ${situation}

해당 기준을 제 상황에 어떻게 적용해야 하는지, 추가로 준비할 서류가 있는지 안내 부탁드립니다.

감사합니다.`;
}
