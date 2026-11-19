import { POLICIES } from "@/data/policies";

type PolicyStepProps = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
};

export function PolicyStep({ selectedId, onSelect, onNext }: PolicyStepProps) {
  return (
    <>
      <p className="eyebrow">STEP 01</p>
      <h2 className="panel-title">어떤 정책을 신청하려고 했나요?</h2>

      <div className="choices" role="radiogroup" aria-label="신청하려는 정책">
        {POLICIES.map((policy) => (
          <label
            key={policy.id}
            className={`choice${selectedId === policy.id ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name="policy"
              checked={selectedId === policy.id}
              onChange={() => onSelect(policy.id)}
            />
            <span className="choice-body">
              <strong>{policy.name}</strong>
              <span className="muted">{policy.field} 분야 · 가상 정책</span>
            </span>
          </label>
        ))}
      </div>

      <div className="actions">
        <span />
        <button
          type="button"
          className="button button-primary"
          disabled={!selectedId}
          onClick={onNext}
        >
          다음 →
        </button>
      </div>
    </>
  );
}
