import type { Policy } from "@/data/policies";
import type { Diagnosis } from "@/lib/diagnosis";

type ApplyActionProps = {
  policy: Policy;
  diagnosis: Diagnosis;
};

/**
 * 공식 신청 사이트 바로가기.
 * 모의 판정 결과와 관계없이 실제 자격과 신청은 공식 사이트에서 확인해야 하므로 준비율과 상관없이 항상 연다.
 */
export function ApplyAction({ policy, diagnosis }: ApplyActionProps) {
  const { application } = diagnosis;

  return (
    <div className="apply">
      <a
        className="button button-primary button-block"
        href={policy.apply.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        공식 신청 사이트에서 확인하기 <span aria-hidden="true">↗</span>
        <span className="sr-only">({policy.apply.name}, 새 탭에서 열림)</span>
      </a>
      <p className="hint">모의 판정이에요. 실제 자격과 신청은 공식 사이트에서 확인해요.</p>
      {application.status === "closed" && (
        <p className="hint">
          {application.title} · 다음 공고는 {policy.apply.name}에서 확인해요.
        </p>
      )}
      {application.status === "upcoming" && (
        <p className="hint">
          {application.title} · {application.label}
        </p>
      )}
    </div>
  );
}
