import { CAUSE_CATALOG, CONVERSATION_CAUSES } from "@/lib/causes";
import type { EligibilityResult, PolicyStatus } from "@/lib/eligibility";
import type { Policy } from "@/lib/policies";
import { EMPLOYMENT_LABELS, HOUSING_LABELS, type Profile } from "@/lib/profile";

export const STATUS_LABELS: Record<PolicyStatus, string> = {
  eligible: "신청 가능",
  not_open: "접수 대기",
  fixable: "보완 필요",
  needs_check: "확인 필요",
  ineligible: "대상 아님",
  already_receiving: "이용 중",
};

/** 채팅 첫 안내문. API 호출 없이 판정 결과로 바로 만든다. */
export function buildOpener(results: EligibilityResult[]): string {
  const count = (...statuses: PolicyStatus[]) =>
    results.filter((result) => statuses.includes(result.status)).length;

  return [
    `입력한 프로필로 정책 ${results.length}개의 자격을 계산했어요.`,
    `바로 신청할 수 있는 정책 ${count("eligible")}개, 보완하거나 확인하면 가능성이 있는 정책 ${count("fixable", "needs_check")}개, 접수를 기다리는 정책 ${count("not_open")}개가 있어요.`,
    "그동안 이런 정책을 신청하지 못했던 가장 큰 이유는 무엇이었나요?",
  ].join(" ");
}

function describeResult(policy: Policy, result: EligibilityResult): string {
  const blockers = result.checks
    .filter((check) => check.outcome !== "pass")
    .map((check) => `${check.label}(${check.detail})`)
    .join(", ");

  return [
    `- id: ${policy.id}`,
    `이름: ${policy.name}`,
    `혜택: ${policy.benefit}`,
    `판정: ${STATUS_LABELS[result.status]}`,
    `접수: ${result.windowLabel}`,
    `미충족·미확인 항목: ${blockers || "없음"}`,
  ].join(" | ");
}

export function buildSystemPrompt(
  profile: Profile,
  policies: Policy[],
  results: EligibilityResult[],
): string {
  const causeGuide = CONVERSATION_CAUSES.map(
    (code) => `- ${code}: ${CAUSE_CATALOG[code].title} (${CAUSE_CATALOG[code].description})`,
  ).join("\n");

  const resultLines = results
    .map((result) => {
      const policy = policies.find((item) => item.id === result.policyId);
      return policy ? describeResult(policy, result) : "";
    })
    .join("\n");

  return `당신은 청년이 정책 혜택을 받지 못한 원인을 찾아 주는 상담사입니다. 한국어 존댓말로, 따뜻하고 간결하게 대화합니다.

# 역할의 경계
- 자격 판정은 이미 프로그램이 계산했습니다. 아래 판정 결과가 유일한 기준이며, 당신이 자격을 새로 판단하거나 뒤집으면 안 됩니다.
- 사용자가 프로필과 다른 사실을 말하면 판정을 바꾸지 말고, 프로필을 수정하면 다시 계산된다고 안내합니다.
- 정책 내용은 아래 목록에 있는 사실만 말합니다. 금액, 기간, 서류를 지어내지 않습니다.
- 정책은 모두 프로토타입용 가상 데이터입니다.

# 대화 방식
- 목표는 판정이 "대상 아님"이나 "이용 중"이 아닌 정책에 대해, 사용자가 신청하지 못한 행동적 원인을 찾는 것입니다.
- 한 번에 질문 하나만, 답변은 세 문장 이내로 합니다. 마크다운 없이 평문으로 씁니다.
- 사용자의 말을 먼저 짧게 받아 준 뒤, 구체적인 경험을 묻습니다.
- 정책과 무관한 요청은 정중히 진단 주제로 되돌립니다.

# 진단 마무리
- 3~5번 주고받아 원인이 파악되었거나 사용자가 마무리를 요청하면, 한 문장으로 인사한 뒤 submit_diagnosis 도구를 호출합니다.
- findings에는 대화에서 실제로 확인한 원인만 넣습니다. 추측으로 채우지 않으며, 확인된 원인이 없으면 빈 배열을 보냅니다.
- 사용자가 특정 정책을 말하지 않고 전반적인 원인을 말했다면, 판정이 "대상 아님"과 "이용 중"이 아닌 정책 각각에 그 원인을 기록합니다.

# 원인 코드
${causeGuide}

# 사용자 프로필
- 만 ${profile.age}세, ${profile.region} 거주 ${profile.residencyMonths}개월
- 취업 상태: ${EMPLOYMENT_LABELS[profile.employment]}
- 주거 형태: ${HOUSING_LABELS[profile.housing]}

# 프로그램이 계산한 판정 결과
${resultLines}

# 사용자가 이미 본 첫 안내
${buildOpener(results)}`;
}
