import type { Policy } from "@/data/policies";
import type { Diagnosis } from "@/lib/diagnosis";
import { OfficialSiteNotice } from "./OfficialSiteNotice";

type ApplyActionProps = {
  policy: Policy;
  diagnosis: Diagnosis;
};

export function ApplyAction({ policy, diagnosis }: ApplyActionProps) {
  if (!diagnosis.canApply) {
    const reason =
      diagnosis.route === "INELIGIBLE"
        ? "입력한 내용으로는 충족하지 못한 것으로 보이는 조건이 있어요."
        : `남은 항목 ${diagnosis.remaining}개를 완료하면 신청 버튼이 열려요.`;

    return (
      <div className="apply">
        <button type="button" className="button button-primary button-block" disabled>
          신청하기
        </button>
        <p className="hint">{reason}</p>
      </div>
    );
  }

  return (
    <div className="apply">
      <a
        className="button button-primary button-block"
        href={policy.apply.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {policy.apply.name}에서 신청하기 <span aria-hidden="true">↗</span>
        <span className="sr-only">(새 탭에서 열림)</span>
      </a>
      <OfficialSiteNotice />
      <p className="hint">
        가상 정책이므로 같은 분야의 공식 사이트로 연결합니다. 실제 정책과 자격은 해당 사이트에서
        확인해 주세요.
      </p>
    </div>
  );
}
