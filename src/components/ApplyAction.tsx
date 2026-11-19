import type { Policy } from "@/data/policies";
import type { Diagnosis } from "@/lib/diagnosis";
import { OfficialSiteNotice } from "./OfficialSiteNotice";

type ApplyActionProps = {
  policy: Policy;
  diagnosis: Diagnosis;
};

function reasonFor(diagnosis: Diagnosis): string {
  if (diagnosis.route === "INELIGIBLE") {
    return "입력한 내용으로는 충족하지 못한 것으로 보이는 조건이 있어요.";
  }
  if (diagnosis.application.status !== "open") {
    return `${diagnosis.application.label}. 다음 공고를 기다려 주세요.`;
  }
  return `남은 항목 ${diagnosis.remaining}개를 완료하면 신청 버튼이 열려요.`;
}

export function ApplyAction({ policy, diagnosis }: ApplyActionProps) {
  if (!diagnosis.canApply) {
    const closed = diagnosis.application.status !== "open";
    return (
      <div className="apply">
        <button type="button" className="button button-primary button-block" disabled>
          {closed ? diagnosis.application.title : "신청하기"}
        </button>
        <p className="hint">{reasonFor(diagnosis)}</p>
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
    </div>
  );
}
