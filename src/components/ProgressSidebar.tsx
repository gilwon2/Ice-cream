import type { Policy } from "@/data/policies";
import type { Diagnosis, ProgressItem } from "@/lib/diagnosis";
import { ApplyAction } from "./ApplyAction";

const STATE_LABEL: Record<ProgressItem["state"], string> = {
  done: "완료",
  blocked: "미충족으로 보임",
  todo: "남음",
};

const STATE_ICON: Record<ProgressItem["state"], string> = {
  done: "✓",
  blocked: "!",
  todo: "",
};

type ProgressSidebarProps = {
  policy: Policy | null;
  diagnosis: Diagnosis | null;
};

export function ProgressSidebar({ policy, diagnosis }: ProgressSidebarProps) {
  if (!policy || !diagnosis) {
    return (
      <aside className="sidebar" id="progress-panel">
        <section className="card">
          <h2 className="card-title">신청 준비 진행률</h2>
          <p className="muted">정책을 선택하면 조건과 진행률이 표시됩니다.</p>
        </section>
      </aside>
    );
  }

  return (
    <aside className="sidebar" id="progress-panel">
      <section className="card" aria-labelledby="progress-title">
        <div className="progress-head">
          <h2 className="card-title" id="progress-title">
            신청 준비 진행률
          </h2>
          <strong className="progress-value" aria-live="polite">
            {diagnosis.percent}%
          </strong>
        </div>
        <div
          className={`meter meter-large${diagnosis.percent === 100 ? " is-complete" : ""}`}
          role="progressbar"
          aria-label="신청 준비 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={diagnosis.percent}
        >
          <span style={{ width: `${diagnosis.percent}%` }} />
        </div>

        <ul className="progress-list">
          {diagnosis.items.map((item) => (
            <li key={item.id} className={`progress-item is-${item.state}`}>
              <span className="progress-icon" aria-hidden="true">
                {STATE_ICON[item.state]}
              </span>
              <span>{item.label}</span>
              <span className="progress-state">{STATE_LABEL[item.state]}</span>
            </li>
          ))}
        </ul>

        <ApplyAction policy={policy} diagnosis={diagnosis} />
      </section>

      <section className="card" aria-labelledby="policy-info-title">
        <h2 className="card-title" id="policy-info-title">
          {policy.name}
        </h2>
        <p className="tag">가상 데이터</p>
        <dl className="facts">
          <div>
            <dt>연령</dt>
            <dd>
              만 {policy.minAge}~{policy.maxAge}세
            </dd>
          </div>
          <div>
            <dt>거주지</dt>
            <dd>{policy.regionLabel}</dd>
          </div>
          <div>
            <dt>월소득 기준</dt>
            <dd>{policy.maxMonthlyIncome}만 원 이하</dd>
          </div>
          <div>
            <dt>제출서류</dt>
            <dd>{policy.documents.map((document) => document.label).join(", ")}</dd>
          </div>
          <div>
            <dt>신청 방법</dt>
            <dd>{policy.applyMethod}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
