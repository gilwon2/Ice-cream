import type { Policy } from "@/data/policies";
import type { Diagnosis, ProgressItem } from "@/lib/diagnosis";
import { formatIsoDate } from "@/lib/rules";
import { ApplyAction } from "./ApplyAction";
import { SourceLink } from "./SourceLink";

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

      <section className="card sidebar-sticky" aria-labelledby="progress-title">
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
    </aside>
  );
}
