import type { Policy } from "@/data/policies";
import { evaluationContext } from "@/lib/diagnosis";
import { previewOutcomes, type Answers, type RuleResult, type RuleStatus } from "@/lib/rules";
import { SourceLink } from "./SourceLink";

export const STATUS_LABEL: Record<RuleStatus, string> = {
  MET: "충족으로 보임",
  NOT_MET: "미충족으로 보임",
  UNKNOWN: "확인 필요",
  NOT_APPLICABLE: "해당 없음",
};

type ConditionListProps = {
  policy: Policy;
  conditions: RuleResult[];
  answers: Answers;
  now: Date;
};

function AnswerPreview({
  policy,
  condition,
  answers,
  now,
}: {
  policy: Policy;
  condition: RuleResult;
  answers: Answers;
  now: Date;
}) {
  const rule = policy.rules.find((item) => item.id === condition.ruleId);
  if (!rule) return null;
  const previews = previewOutcomes(rule, evaluationContext(policy, answers, now)).filter(
    (preview) => preview.status === "MET" || preview.status === "NOT_MET",
  );
  if (previews.length === 0) return null;

  return (
    <div className="rule-preview">
      <p className="rule-preview-title">확인한 답에 따라 이렇게 판단해요</p>
      <ul>
        {previews.map((preview) => (
          <li key={preview.label}>
            {preview.label}:{" "}
            <span className={`status is-${preview.status.toLowerCase()}`}>
              {STATUS_LABEL[preview.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConditionList({ policy, conditions, answers, now }: ConditionListProps) {
  const ordered = [
    ...conditions.filter((condition) => condition.status !== "NOT_APPLICABLE"),
    ...conditions.filter((condition) => condition.status === "NOT_APPLICABLE"),
  ];

  return (
    <ul className="rule-list">
      {ordered.map((condition) => {
        const status = condition.status.toLowerCase();
        return (
          <li key={condition.ruleId} className={`rule-row is-${status}`}>
            <div className="rule-head">
              <strong>{condition.label}</strong>
              <span className={`status is-${status}`}>{STATUS_LABEL[condition.status]}</span>
              {!condition.verified && <span className="tag tag-inline">확인 중인 기준</span>}
            </div>
            <p className="rule-reason">{condition.reason}</p>

            <dl className="rule-evidence">
              <div>
                <dt>기준</dt>
                <dd>{condition.evidence.criterion}</dd>
              </div>
              {condition.evidence.inputs.length > 0 && (
                <div>
                  <dt>입력</dt>
                  <dd>
                    {condition.evidence.inputs
                      .map((input) => `${input.label} ${input.value}`)
                      .join(" · ")}
                  </dd>
                </div>
              )}
              <div>
                <dt>출처</dt>
                <dd className="rule-sources">
                  <SourceLink source={condition.source} />
                  {condition.evidence.references.map((reference) => (
                    <SourceLink key={reference.url} source={reference} />
                  ))}
                </dd>
              </div>
            </dl>

            <details className="rule-details" open={condition.status === "UNKNOWN"}>
              <summary>쉬운 뜻과 확인 방법</summary>
              <p>{condition.plainText}</p>
              <ul>
                {condition.howToCheck.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              {condition.status === "UNKNOWN" && (
                <AnswerPreview
                  policy={policy}
                  condition={condition}
                  answers={answers}
                  now={now}
                />
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
}
