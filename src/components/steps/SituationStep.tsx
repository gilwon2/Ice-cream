import type { ReactNode } from "react";
import {
  EMPLOYMENT_STATUSES,
  INQUIRY_TOPICS,
  REGIONS,
  type Policy,
} from "@/data/policies";
import type { Blocker, ConditionResult, Profile } from "@/lib/diagnosis";
import { DocumentChecklist } from "../DocumentChecklist";

const NOTE_COPY: Record<Blocker, { label: string; placeholder: string }> = {
  documents: {
    label: "막힌 상황을 한 문장으로 설명하기 (선택)",
    placeholder: "예: 어떤 서류를 어디서 발급받는지 모르겠어요.",
  },
  eligibility: {
    label: "정책 기준과 별개로 어려운 점 (선택)",
    placeholder: "예: 소득이 조금 높지만 매달 주거비가 많이 들어 부담스러워요.",
  },
  unclear: {
    label: "상황 설명 (선택)",
    placeholder: "예: 부모님과 다른 주소에 살고 있는데 가구 기준이 궁금해요.",
  },
};

const SAMPLE_PROFILE: Profile = {
  age: "25",
  region: "서울",
  monthlyIncome: "280",
  status: "미취업",
};

type SituationStepProps = {
  policy: Policy;
  blocker: Blocker;
  profile: Profile;
  conditions: ConditionResult[];
  checkedDocumentIds: string[];
  inquiryTopic: string;
  note: string;
  onProfileChange: (profile: Profile) => void;
  onToggleDocument: (id: string) => void;
  onInquiryTopicChange: (topic: string) => void;
  onNoteChange: (note: string) => void;
  onBack: () => void;
  onNext: () => void;
};

function ConditionHint({ condition }: { condition?: ConditionResult }) {
  if (!condition) return null;
  return (
    <p className={`field-hint is-${condition.status.toLowerCase()}`}>
      기준 {condition.criterion} · {condition.detail}
    </p>
  );
}

export function SituationStep({
  policy,
  blocker,
  profile,
  conditions,
  checkedDocumentIds,
  inquiryTopic,
  note,
  onProfileChange,
  onToggleDocument,
  onInquiryTopicChange,
  onNoteChange,
  onBack,
  onNext,
}: SituationStepProps) {
  const update = (key: keyof Profile, value: string) =>
    onProfileChange({ ...profile, [key]: value });
  const conditionOf = (id: ConditionResult["id"]) =>
    conditions.find((condition) => condition.id === id);

  const eligibilitySection: ReactNode = (
    <section className="section" key="eligibility">
      <div className="section-head">
        <div>
          <h3>자격 조건 확인</h3>
          <p className="muted">정책에서 명확하게 비교할 수 있는 조건부터 확인합니다.</p>
        </div>
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={() => onProfileChange(SAMPLE_PROFILE)}
        >
          예시 값 채우기
        </button>
      </div>

      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="age">
            만 나이
          </label>
          <div className="input-unit">
            <input
              id="age"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="25"
              value={profile.age}
              onChange={(event) => update("age", event.target.value)}
            />
            <span>세</span>
          </div>
          <ConditionHint condition={conditionOf("age")} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="region">
            거주지역
          </label>
          <select
            id="region"
            value={profile.region}
            onChange={(event) => update("region", event.target.value)}
          >
            <option value="">선택해 주세요</option>
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <ConditionHint condition={conditionOf("region")} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="income">
            월소득
          </label>
          <div className="input-unit">
            <input
              id="income"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="280"
              value={profile.monthlyIncome}
              onChange={(event) => update("monthlyIncome", event.target.value)}
            />
            <span>만 원</span>
          </div>
          <ConditionHint condition={conditionOf("income")} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="status">
            현재 상태
          </label>
          <select
            id="status"
            value={profile.status}
            onChange={(event) => update("status", event.target.value)}
          >
            <option value="">선택해 주세요</option>
            {EMPLOYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );

  const documentsSection: ReactNode = (
    <section className="section" key="documents">
      <h3>제출서류 체크리스트</h3>
      <p className="muted">
        준비가 끝난 서류에 체크하세요. 발급 사이트에서 서류를 받은 뒤 이 화면으로 돌아와 직접
        체크하면 진행률이 올라갑니다.
      </p>
      <DocumentChecklist
        documents={policy.documents}
        checkedIds={checkedDocumentIds}
        onToggle={onToggleDocument}
      />
    </section>
  );

  const inquirySection: ReactNode = (
    <section className="section" key="inquiry">
      <h3>확인이 필요한 주제</h3>
      <p className="muted">정확하게 판단하기 어려운 부분을 선택해 주세요.</p>
      <div className="pill-group" role="radiogroup" aria-label="확인이 필요한 주제">
        {INQUIRY_TOPICS.map((topic) => (
          <label key={topic} className={`pill${inquiryTopic === topic ? " is-selected" : ""}`}>
            <input
              type="radio"
              name="inquiry-topic"
              checked={inquiryTopic === topic}
              onChange={() => onInquiryTopicChange(topic)}
            />
            {topic}
          </label>
        ))}
      </div>
    </section>
  );

  const sections =
    blocker === "documents"
      ? [documentsSection, eligibilitySection]
      : blocker === "eligibility"
        ? [eligibilitySection, documentsSection]
        : [inquirySection, eligibilitySection, documentsSection];

  return (
    <>
      <p className="eyebrow">STEP 03</p>
      <h2 className="panel-title">지금 상황을 확인해 주세요</h2>

      {sections}

      <section className="section">
        <label className="field-label" htmlFor="note">
          {NOTE_COPY[blocker].label}
        </label>
        <textarea
          id="note"
          rows={3}
          placeholder={NOTE_COPY[blocker].placeholder}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
        <p className="hint">이름, 연락처, 주민등록번호 같은 개인정보는 입력하지 마세요.</p>
      </section>

      <div className="actions">
        <button type="button" className="button button-ghost" onClick={onBack}>
          ← 이전
        </button>
        <button type="button" className="button button-primary" onClick={onNext}>
          진단 결과 확인 →
        </button>
      </div>
    </>
  );
}
