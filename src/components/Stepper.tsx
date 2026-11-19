const STEPS = ["정책 선택", "막힌 지점", "상황 확인", "해결 안내"];

type StepperProps = {
  current: number;
  reachable: number;
  onSelect: (step: number) => void;
};

export function Stepper({ current, reachable, onSelect }: StepperProps) {
  return (
    <nav aria-label="진행 단계">
      <ol className="stepper">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              className={`step${index === current ? " is-current" : ""}${index < current ? " is-past" : ""}`}
              disabled={index > reachable}
              aria-current={index === current ? "step" : undefined}
              onClick={() => onSelect(index)}
            >
              <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="step-label">{label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
