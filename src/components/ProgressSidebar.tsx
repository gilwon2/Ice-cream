import type { Policy } from "@/data/policies";
import type { Diagnosis } from "@/lib/diagnosis";
import {
  eligibilityItems,
  progressDescription,
  progressSummary,
  STATUS_LABEL,
  type EligibilityItem,
} from "@/lib/resultSummary";
import { formatIsoDate } from "@/lib/rules";
import { ApplyAction } from "./ApplyAction";
import { SourceLink } from "./SourceLink";

/** 자격 상태를 기존 진행 목록 스타일(is-done, is-blocked, is-unknown)에 맞춘다. */
const ELIGIBILITY_STYLE: Record<EligibilityItem["status"], { className: string; icon: string }> = {
  MET: { className: "is-done", icon: "✓" },
  NOT_MET: { className: "is-blocked", icon: "!" },
  UNKNOWN: { className: "is-unknown", icon: "?" },
};

type ProgressSidebarProps = {
  policy: Policy | null;
  diagnosis: Diagnosis | null;
  /** false면 정책 정보만 보여준다. 정책을 고르는 STEP 01에서는 아직 진행률이 의미 없어 숨긴다. */
  showProgress: boolean;
};

/**
 * 진행 상황 카드. 자격 확인(개수만)과 신청 준비(서류 n개 중 m개)를 나눠 보여준다.
 * 자격에 퍼센트를 쓰지 않아 미충족·확인 필요가 있는데 높은 숫자가 보이는 일이 없다.
 */
function ProgressCard({ policy, diagnosis }: { policy: Policy; diagnosis: Diagnosis }) {
  const summary = progressSummary(diagnosis);
  const { eligibility, documents } = summary;
  const checked = new Set(
    diagnosis.documents
      .filter((document) => !diagnosis.missingDocuments.includes(document))
      .map((document) => document.id),
  );

  return (
    <section className="card sidebar-sticky" aria-labelledby="progress-title">
      <h2 className="card-title" id="progress-title">
        진행 상황
      </h2>
      <p className="sr-only" aria-live="polite">
        {progressDescription(summary)}
      </p>

      <div className="progress-group" data-testid="sidebar-eligibility">
        <h3 className="progress-group-title">자격 확인</h3>
        <p className="progress-counts">
          <span className="is-met">
            충족 <strong data-count="met">{eligibility.met}</strong>
          </span>
          <span className="is-not_met">
            미충족 가능성 <strong data-count="notMet">{eligibility.notMet}</strong>
          </span>
          <span className="is-unknown">
            확인 필요 <strong data-count="unknown">{eligibility.unknown}</strong>
          </span>
        </p>
        <ul className="progress-list">
          {eligibilityItems(diagnosis.conditions).map((item) => (
            <li key={item.id} className={`progress-item ${ELIGIBILITY_STYLE[item.status].className}`}>
              <span className="progress-icon" aria-hidden="true">
                {ELIGIBILITY_STYLE[item.status].icon}
              </span>
              <span>{item.label}</span>
              <span className="progress-state">{STATUS_LABEL[item.status]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="progress-group" data-testid="sidebar-documents">
        <div className="progress-head">
          <h3 className="progress-group-title">신청 준비</h3>
          <span className="progress-doc-count">
            서류 <strong data-count="docTotal">{documents.total}</strong>개 중{" "}
            <strong data-count="docDone">{documents.done}</strong>개 완료
          </span>
        </div>
        {documents.total > 0 && (
          <div
            className={`meter meter-large${documents.percent === 100 ? " is-complete" : ""}`}
            role="progressbar"
            aria-label="서류 준비"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={documents.percent}
          >
            <span style={{ width: `${documents.percent}%` }} />
          </div>
        )}
        {documents.total > 0 ? (
          <ul className="progress-list">
            {diagnosis.documents.map((document) => {
              const done = checked.has(document.id);
              return (
                <li key={document.id} className={`progress-item${done ? " is-done" : ""}`}>
                  <span className="progress-icon" aria-hidden="true">
                    {done ? "✓" : ""}
                  </span>
                  <span>{document.label}</span>
                  <span className="progress-state">{done ? "완료" : "남음"}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted progress-empty">지금 답으로는 준비할 서류가 없어요.</p>
        )}
      </div>

      <ApplyAction policy={policy} diagnosis={diagnosis} />
    </section>
  );
}

export function ProgressSidebar({ policy, diagnosis, showProgress }: ProgressSidebarProps) {
  if (!policy || !diagnosis) {
    return (
      <aside className="sidebar" id="progress-panel">
        <section className="card">
          <h2 className="card-title">정책 정보</h2>
          <p className="muted">정책을 선택하면 지원 내용과 신청 기간이 표시돼요.</p>
        </section>
      </aside>
    );
  }

  const { application } = diagnosis;

  // 정책 정보 카드를 먼저 두고 진행률 카드만 sticky로 둔다. 스크롤하면 정책 정보는
  // 위로 지나가고 진행률·신청 버튼은 따라오므로, 사이드바가 화면보다 길어도 잘리지 않는다.
  return (
    <aside className="sidebar" id="progress-panel">
      <section className="card" aria-labelledby="policy-info-title">
        <h2 className="card-title" id="policy-info-title">
          {policy.name}
        </h2>
        <p className={`tag${application.status === "open" ? " tag-success" : ""}`}>
          {application.title}
        </p>
        <dl className="facts">
          <div>
            <dt>지원 내용</dt>
            <dd>{policy.benefit}</dd>
          </div>
          <div>
            <dt>신청 기간</dt>
            <dd>{application.label}</dd>
          </div>
          <div>
            <dt>신청 방법</dt>
            <dd>{policy.applyMethod}</dd>
          </div>
          <div>
            <dt>공고 기준일</dt>
            <dd>{formatIsoDate(policy.announcement.publishedAt)}</dd>
          </div>
          <div>
            <dt>공고</dt>
            <dd>
              <SourceLink
                source={{ name: policy.announcement.title, url: policy.announcement.url }}
              />
            </dd>
          </div>
        </dl>
      </section>

      {showProgress && <ProgressCard policy={policy} diagnosis={diagnosis} />}
    </aside>
  );
}
