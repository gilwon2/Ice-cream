"use client";

import { useState } from "react";
import type { Policy } from "@/data/policies";
import { evaluationContext } from "@/lib/diagnosis";
import { displayStatus, splitConditions, STATUS_LABEL } from "@/lib/resultSummary";
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
  const [open, setOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const shown = displayStatus(condition);
  const status = shown.toLowerCase();
  const rule = policy.rules.find((item) => item.id === condition.ruleId);
  const explainId = `result-${condition.ruleId}-explain`;
  // 해당 없는 조건은 설명할 판단이 없어 AI 설명을 두지 않는다.
  const canExplain = Boolean(rule) && condition.status !== "NOT_APPLICABLE";
  // 막힌 조건은 카드를 펼치지 않아도 AI 설명 버튼이 보이게 해 첫 화면에서 바로 누를 수 있게 한다.
  const showQuickExplain = canExplain && !open && (shown === "NOT_MET" || shown === "UNKNOWN");

  return (
    <li>
      <details
        className={`rule-row is-${status}`}
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
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
                  onClick={() => setExplainOpen((current) => !current)}
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
      {/* <details> 안에 두면 접힌 동안 보이지 않아 카드 바로 아래에 둔다. 누르면 카드와 설명을 함께 연다. */}
      {showQuickExplain && (
        <button
          type="button"
          className="button button-secondary button-small rule-ai-quick"
          onClick={() => {
            setOpen(true);
            setExplainOpen(true);
          }}
        >
          <AiBadge />내 상황에 맞춘 설명 보기
        </button>
      )}
    </li>
  );
}

/**
 * 미충족·확인 필요 조건을 먼저 보여주고, 충족·해당 없음 조건은 버튼 하나로 접어 둔다.
 * 접은 조건도 펼치면 같은 카드로 기준·입력·출처를 확인할 수 있다.
 */
export function ConditionList({ policy, conditions, answers, now, onRequestInquiry }: ConditionListProps) {
  const [settledOpen, setSettledOpen] = useState(false);
  const { attention, settled } = splitConditions(conditions);
  const metCount = settled.filter((condition) => condition.status === "MET").length;
  const notApplicableCount = settled.length - metCount;
  const settledCountLabel =
    metCount > 0
      ? `충족한 조건 ${metCount}개${notApplicableCount > 0 ? ` · 해당 없음 ${notApplicableCount}개` : ""}`
      : `해당 없는 조건 ${notApplicableCount}개`;

  const renderCard = (condition: RuleResult) => (
    <ConditionCard
      key={condition.ruleId}
      policy={policy}
      condition={condition}
      answers={answers}
      now={now}
      onRequestInquiry={onRequestInquiry}
    />
  );

  return (
    <>
      {attention.length > 0 ? (
        <ul className="rule-list">{attention.map(renderCard)}</ul>
      ) : (
        <p className="muted rule-empty">미충족이거나 확인이 필요한 조건은 없어요.</p>
      )}

      {settled.length > 0 && (
        <div className="rule-settled">
          <button
            type="button"
            className="button button-ghost button-small rule-settled-toggle"
            aria-expanded={settledOpen}
            aria-controls="settled-conditions"
            onClick={() => setSettledOpen((current) => !current)}
          >
            {settledOpen ? `${settledCountLabel} 접기` : `${settledCountLabel} 보기`}
            <span aria-hidden="true">{settledOpen ? " ▴" : " ▾"}</span>
          </button>
          {settledOpen && (
            <ul className="rule-list" id="settled-conditions">
              {settled.map(renderCard)}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
