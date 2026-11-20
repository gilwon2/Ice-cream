import type { Policy } from "@/data/policies";
import type { Diagnosis, Route } from "@/lib/diagnosis";
import { countConditions } from "@/lib/resultSummary";
import { formatIsoDate } from "@/lib/rules";
import { ApplyAction } from "./ApplyAction";
import { SourceLink } from "./SourceLink";

const ROUTE_COPY: Record<Route, { tone: string; label: string; title: string; body: string }> = {
  READY: {
    tone: "success",
    label: "신청 준비 항목 완료",
    title: "입력한 내용으로는 신청 준비를 마친 것으로 보여요",
    body: "최종 자격은 공식 기관의 심사로 결정돼요. 공식 사이트에서 조건, 신청기간, 접수 경로를 확인한 뒤 직접 신청해 주세요.",
  },
  ACTION_REQUIRED: {
    tone: "info",
    label: "해결 가능한 장애물",
    title: "입력한 조건은 충족하는 것으로 보여요",
    body: "아래 서류를 준비해 체크해 주세요. 최종 자격은 공식 기관의 심사로 결정돼요.",
  },
  INELIGIBLE: {
    tone: "danger",
    label: "자격 미충족 가능성",
    title: "입력한 내용으로는 충족하지 못한 것으로 보이는 조건이 있어요",
    body: "사유를 확인하고 다른 지원 가능성을 검토해 보세요. 원한다면 정책 개선 제안문을 작성할 수 있어요.",
  },
  NEEDS_INQUIRY: {
    tone: "warning",
    label: "추가 확인 필요",
    title: "아직 판단할 수 없는 조건이 있어요",
    body: "입력하지 않았거나, 모르겠다고 답했거나, 확인 중인 기준에 걸린 조건은 임의로 판정하지 않아요.",
  },
};

/** 경로마다 다음 행동은 하나만 보여준다. */
export const ROUTE_ACTION: Record<Route, string> = {
  NEEDS_INQUIRY: "기관 문의문 작성",
  INELIGIBLE: "개선 제안문 작성",
  ACTION_REQUIRED: "신청 준비",
  READY: "신청 준비",
};

type ResultSummaryProps = {
  policy: Policy;
  diagnosis: Diagnosis;
  onAction: () => void;
};

export function ResultSummary({ policy, diagnosis, onAction }: ResultSummaryProps) {
  const copy = ROUTE_COPY[diagnosis.route];
  const counts = countConditions(diagnosis.conditions);
  const body =
    diagnosis.route === "READY" && diagnosis.application.status !== "open"
      ? "지금은 접수 기간이 아니에요. 다음 공고가 나오면 기준을 다시 확인하고 신청하세요."
      : copy.body;

  return (
    <section className={`result-summary is-${copy.tone}`} aria-labelledby="result-summary-title">
      <div role="status">
        <span className="result-label">{copy.label}</span>
        <strong id="result-summary-title" className="result-summary-title">
          {copy.title}
        </strong>
        <p className="result-summary-body">{body}</p>
      </div>

      <ul className="result-counts" aria-label="조건별 판정 개수">
        <li className="result-count is-met">
          <span>충족</span>
          <strong>{counts.met}</strong>
        </li>
        <li className="result-count is-not_met">
          <span>미충족</span>
          <strong>{counts.notMet}</strong>
        </li>
        <li className="result-count is-unknown">
          <span>확인 필요</span>
          <strong>{counts.unknown}</strong>
        </li>
      </ul>

      <button
        type="button"
        className="button button-primary button-block"
        data-summary-action
        onClick={onAction}
      >
        {ROUTE_ACTION[diagnosis.route]} <span aria-hidden="true">↓</span>
      </button>

      {/* 모바일에서는 사이드바의 공식 신청 사이트 버튼이 맨 아래에 있으므로 요약 카드에도 보여준다.
          READY는 아래 신청 영역에 같은 버튼이 있어 넣지 않는다. 데스크톱에서는 CSS로 숨긴다. */}
      {diagnosis.route !== "READY" && (
        <div className="summary-apply">
          <ApplyAction policy={policy} diagnosis={diagnosis} />
        </div>
      )}

      <p className="result-meta">
        공고 기준일 {formatIsoDate(policy.announcement.publishedAt)} ·{" "}
        <SourceLink source={{ name: policy.announcement.title, url: policy.announcement.url }} /> ·
        정보 확인일 {formatIsoDate(policy.announcement.checkedAt)}
      </p>
    </section>
  );
}
