"use client";

import { useState } from "react";
import type { Policy } from "@/data/policies";
import { evaluationContext } from "@/lib/diagnosis";
import { displayStatus, orderConditions, STATUS_LABEL } from "@/lib/resultSummary";
import { previewOutcomes, type Answers, type RuleResult } from "@/lib/rules";
import { AiBadge } from "./AiBadge";
import { ExplanationCard } from "./ExplanationCard";
import { SourceLink } from "./SourceLink";

type ConditionListProps = {
  policy: Policy;
  conditions: RuleResult[];
  answers: Answers;
  now: Date;
  onRequestInquiry: (ruleId: string) => void;
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

function ConditionCard({
  policy,
  condition,
  answers,
  now,
  onRequestInquiry,
}: {
  policy: Policy;
  condition: RuleResult;
  answers: Answers;
  now: Date;
  onRequestInquiry: (ruleId: string) => void;
}) {
  const [explainOpen, setExplainOpen] = useState(false);
  const shown = displayStatus(condition);
  const status = shown.toLowerCase();
  const rule = policy.rules.find((item) => item.id === condition.ruleId);
  const explainId = `result-${condition.ruleId}-explain`;
  // 해당 없는 조건은 설명할 판단이 없어 AI 설명을 두지 않는다.
  const canExplain = Boolean(rule) && condition.status !== "NOT_APPLICABLE";

  return (
    <li>
      <details className={`rule-row is-${status}`}>
        <summary className="rule-summary">
          <span className="rule-head">
            <strong>{condition.label}</strong>
            <span className={`status is-${status}`}>{STATUS_LABEL[shown]}</span>
            {!condition.verified && <span className="tag tag-inline">확인 중인 기준</span>}
          </span>
          <span className="rule-reason">{condition.reason}</span>
        </summary>

        <div className="rule-body">
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

          <div className="rule-details">
            <p>{condition.plainText}</p>

            {canExplain && rule && (
              <>
                <button
                  type="button"
                  className="button button-secondary button-small rule-ai-explain"
                  aria-expanded={explainOpen}
                  aria-controls={explainOpen ? explainId : undefined}
                  onClick={() => setExplainOpen((open) => !open)}
                >
                  <AiBadge />
                  {explainOpen ? "AI 설명 닫기" : "내 상황에 맞춘 설명 보기"}
                </button>
                {/* STEP 03과 같은 카드라 같은 요청이면 sessionStorage에 저장된 설명을 그대로 쓴다. */}
                {explainOpen && (
                  <ExplanationCard
                    id={explainId}
                    policy={policy}
                    rule={rule}
                    answers={answers}
                    now={now}
                    onRequestInquiry={onRequestInquiry}
                    onClose={() => setExplainOpen(false)}
                  />
                )}
              </>
            )}

            {/* 설명 카드에도 확인 방법이 있어, 카드를 연 동안에는 겹치지 않게 숨긴다. */}
            {!explainOpen && (
              <>
                <p className="rule-subtitle">확인 방법</p>
                <ul>
                  {condition.howToCheck.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </>
            )}
            {condition.status === "UNKNOWN" && (
              <AnswerPreview policy={policy} condition={condition} answers={answers} now={now} />
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

export function ConditionList({ policy, conditions, answers, now, onRequestInquiry }: ConditionListProps) {
  return (
    <ul className="rule-list">
      {orderConditions(conditions).map((condition) => (
        <ConditionCard
          key={condition.ruleId}
          policy={policy}
          condition={condition}
          answers={answers}
          now={now}
          onRequestInquiry={onRequestInquiry}
        />
      ))}
    </ul>
  );
}
