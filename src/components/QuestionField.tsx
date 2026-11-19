"use client";

import { useState } from "react";
import { UNKNOWN_ANSWER, type Question, type RuleResult } from "@/lib/rules";
import { BirthDateField } from "./BirthDateField";
import { ExplanationCard, type ExplanationTarget } from "./ExplanationCard";

type QuestionFieldProps = {
  question: Question;
  value: string;
  now: Date;
  onChange: (value: string) => void;
  /** 이 질문을 주로 묻는 규칙의 판정 */
  hints: RuleResult[];
  /** 설명 카드로 풀어 줄 규칙. 없으면 "?" 버튼을 보이지 않는다. */
  explain?: ExplanationTarget;
};

const HINT_CLASS: Record<RuleResult["status"], string> = {
  MET: "is-met",
  NOT_MET: "is-not_met",
  UNKNOWN: "is-unknown",
  NOT_APPLICABLE: "is-unknown",
};

function Hints({ hints, value }: { hints: RuleResult[]; value: string }) {
  if (value === "") return null;
  return (
    <>
      {hints.map((hint) => (
        <p key={hint.ruleId} className={`field-hint ${HINT_CLASS[hint.status]}`}>
          {hint.reason}
          {!hint.verified && <span className="tag tag-inline">확인 중인 기준</span>}
        </p>
      ))}
    </>
  );
}

export function QuestionField({ question, value, now, onChange, hints, explain }: QuestionFieldProps) {
  const inputId = `q-${question.id}`;
  const helpId = `${inputId}-help`;
  const cardId = `${inputId}-explain`;
  const isUnknown = value === UNKNOWN_ANSWER;
  // "모르겠어요"를 고르면 설명 카드를 연다. 다시 이 화면에 와도 열린 채로 보여준다.
  const [cardOpen, setCardOpen] = useState(isUnknown);

  const change = (next: string) => {
    if (next === UNKNOWN_ANSWER && explain) setCardOpen(true);
    onChange(next);
  };

  const helpButton = explain && (
    <button
      type="button"
      className="term-help"
      aria-expanded={cardOpen}
      aria-controls={cardOpen ? cardId : undefined}
      aria-label={`'${question.label}' 설명 ${cardOpen ? "닫기" : "보기"}`}
      title="설명 보기"
      onClick={() => setCardOpen((open) => !open)}
    >
      ?
    </button>
  );

  const card = explain && cardOpen && (
    <ExplanationCard id={cardId} now={now} onClose={() => setCardOpen(false)} {...explain} />
  );

  if (question.kind === "date") {
    return (
      <BirthDateField
        inputId={inputId}
        label={question.label}
        labelAddon={helpButton}
        footer={card}
        help={question.help}
        value={value}
        now={now}
        onChange={change}
      >
        <Hints hints={hints} value={value} />
      </BirthDateField>
    );
  }

  if (question.kind === "choice") {
    const options = question.allowUnknown
      ? [...question.options, { value: UNKNOWN_ANSWER, label: "모르겠어요" }]
      : question.options;

    return (
      <fieldset className="question">
        <legend className="field-label">
          {question.label}
          {helpButton}
        </legend>
        {question.help && <p className="hint question-help">{question.help}</p>}
        <div className="pill-group">
          {options.map((option) => (
            <label
              key={option.value}
              className={`pill${value === option.value ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name={inputId}
                checked={value === option.value}
                onChange={() => change(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <Hints hints={hints} value={value} />
        {card}
      </fieldset>
    );
  }

  return (
    <div className="question">
      <div className="field-label-row">
        <label className="field-label" htmlFor={inputId}>
          {question.label}
        </label>
        {helpButton}
      </div>
      {question.help && (
        <p className="hint question-help" id={helpId}>
          {question.help}
        </p>
      )}
      <div className="input-unit">
        <input
          id={inputId}
          type="number"
          inputMode={question.integer ? "numeric" : "decimal"}
          min={0}
          step={question.integer ? 1 : "any"}
          placeholder={question.placeholder}
          disabled={isUnknown}
          value={isUnknown ? "" : value}
          aria-describedby={question.help ? helpId : undefined}
          onChange={(event) => change(event.target.value)}
        />
        <span>{question.unit}</span>
      </div>
      {question.allowUnknown && (
        <label className="unknown-check">
          <input
            type="checkbox"
            checked={isUnknown}
            onChange={(event) => change(event.target.checked ? UNKNOWN_ANSWER : "")}
          />
          <span>모르겠어요</span>
        </label>
      )}
      <Hints hints={hints} value={value} />
      {card}
    </div>
  );
}
