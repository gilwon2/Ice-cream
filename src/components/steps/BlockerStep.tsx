import type { Blocker } from "@/lib/diagnosis";

const BLOCKERS: { id: Blocker; title: string; description: string }[] = [
  {
    id: "documents",
    title: "서류나 신청 절차가 어려워요",
    description: "부족한 서류와 준비 방법을 확인해요.",
  },
  {
    id: "eligibility",
    title: "신청 자격이 안 되는 것 같아요",
    description: "정책 조건과 내 상황을 비교해요.",
  },
  {
    id: "unclear",
    title: "조건이 애매해서 확인이 필요해요",
    description: "기관에 보낼 문의문을 준비해요.",
  },
];

type BlockerStepProps = {
  selected: Blocker | null;
  onSelect: (blocker: Blocker) => void;
  onBack: () => void;
  onNext: () => void;
};

export function BlockerStep({ selected, onSelect, onBack, onNext }: BlockerStepProps) {
  return (
    <>
      <p className="eyebrow">STEP 02</p>
      <h2 className="panel-title">어떤 부분에서 막혔나요?</h2>
      <p className="muted">선택한 내용은 진단의 시작점이에요. 결과는 실제 조건을 비교해 달라질 수 있어요.</p>

      <div className="choices" role="radiogroup" aria-label="신청이 막힌 이유">
        {BLOCKERS.map((blocker) => (
          <label
            key={blocker.id}
            className={`choice${selected === blocker.id ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name="blocker"
              checked={selected === blocker.id}
              onChange={() => onSelect(blocker.id)}
            />
            <span className="choice-body">
              <strong>{blocker.title}</strong>
              <span className="muted">{blocker.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="actions">
        <button type="button" className="button button-ghost" onClick={onBack}>
          ← 이전
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={!selected}
          onClick={onNext}
        >
          다음 →
        </button>
      </div>
    </>
  );
}
