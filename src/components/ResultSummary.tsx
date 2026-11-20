import type { ReactNode } from "react";
import type { Policy } from "@/data/policies";
import type { Diagnosis, Route } from "@/lib/diagnosis";
import { countConditions } from "@/lib/resultSummary";
import { formatIsoDate } from "@/lib/rules";
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
    body: "남은 서류를 준비해 체크해 주세요. 최종 자격은 공식 기관의 심사로 결정돼요.",
  },
  INELIGIBLE: {
    tone: "danger",
    label: "자격 미충족 가능성",
    title: "입력한 내용으로는 충족하지 못한 것으로 보이는 조건이 있어요",
    body: "기준을 다시 확인할 방법과 다른 지원 경로를 먼저 살펴보세요. 원하면 정책 개선을 건의할 수도 있어요.",
  },
  NEEDS_INQUIRY: {
    tone: "warning",
    label: "추가 확인 필요",
    title: "아직 판단할 수 없는 조건이 있어요",
    body: "입력하지 않았거나, 모르겠다고 답했거나, 확인 중인 기준에 걸린 조건은 임의로 판정하지 않아요.",
  },
};

type ResultSummaryProps = {
  policy: Policy;
  diagnosis: Diagnosis;
};

/**
 * 해결 안내 맨 위 요약: 결과와 충족·미충족·확인 필요 개수.
 * 다음 행동은 바로 아래 "다음 행동 선택"에서 고르므로 요약 카드에는 버튼을 두지 않는다.
 */
export function ResultSummary({ policy, diagnosis }: ResultSummaryProps) {
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
        {/* 넓은 화면에서는 설명을 그대로 보여주고, 모바일에서는 막힌 조건이 첫 화면에 들어오도록 접어 둔다. */}
        <p className="result-summary-body is-wide">{body}</p>
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

      {/* 모바일: 접기 줄 오른쪽에 공식 신청 사이트 링크를 같은 줄로 둬서 첫 화면 높이를 늘리지 않는다. */}
      <div className="result-summary-foot is-narrow">
        <details className="result-summary-more">
          <summary>설명·공고 정보 보기</summary>
          <p className="result-summary-body">{body}</p>
          <SummaryMeta policy={policy} />
        </details>
        <OfficialSiteLink policy={policy} />
      </div>
      <div className="is-wide">
        <SummaryMeta policy={policy}>
          {" · "}
          <OfficialSiteLink policy={policy} />
        </SummaryMeta>
      </div>
    </section>
  );
}

function SummaryMeta({ policy, children }: { policy: Policy; children?: ReactNode }) {
  return (
    <p className="result-meta">
      공고 기준일 {formatIsoDate(policy.announcement.publishedAt)} ·{" "}
      <SourceLink source={{ name: policy.announcement.title, url: policy.announcement.url }} /> ·
      정보 확인일 {formatIsoDate(policy.announcement.checkedAt)}
      {children}
    </p>
  );
}

/** 결과와 관계없이 모든 경로에서 보이는 작은 공식 신청 사이트 링크 */
function OfficialSiteLink({ policy }: { policy: Policy }) {
  return (
    <a
      className="result-official-link"
      href={policy.apply.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      공식 신청 사이트 <span aria-hidden="true">↗</span>
      <span className="sr-only">({policy.apply.name}, 새 탭에서 열림)</span>
    </a>
  );
}
