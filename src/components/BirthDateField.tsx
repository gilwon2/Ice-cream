"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  INVALID_BIRTH_DATE_MESSAGE,
  birthYearGroups,
  composeDate,
  daysInMonth,
  describeBirthDate,
  formatDateDigits,
  splitDateText,
  type DateParts,
} from "@/lib/rules";

type BirthDateFieldProps = {
  inputId: string;
  label: string;
  help?: string;
  value: string;
  now: Date;
  onChange: (value: string) => void;
  /** 날짜가 올바를 때만 보여줄 조건 판정 힌트 */
  children?: ReactNode;
  /** 제목 옆에 붙일 요소 (예: 설명 "?" 버튼) */
  labelAddon?: ReactNode;
  /** 맨 아래에 항상 보여줄 요소 (예: 설명 카드) */
  footer?: ReactNode;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function BirthDateField({
  inputId,
  label,
  help,
  value,
  now,
  onChange,
  children,
  labelAddon,
  footer,
}: BirthDateFieldProps) {
  const [mode, setMode] = useState<"text" | "select">("text");
  const [parts, setParts] = useState<DateParts>({ year: "", month: "", day: "" });
  const [touched, setTouched] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLSelectElement>(null);
  const modeSwitched = useRef(false);

  // 입력 방식을 바꾸면 새 입력칸으로 포커스를 옮겨 키보드로 이어서 입력할 수 있게 한다.
  useEffect(() => {
    if (!modeSwitched.current) return;
    (mode === "select" ? yearRef : textRef).current?.focus();
  }, [mode]);

  const switchMode = (next: "text" | "select") => {
    modeSwitched.current = true;
    if (next === "select") setParts(splitDateText(value, now));
    setMode(next);
  };

  const updatePart = (key: keyof DateParts, partValue: string) => {
    const next = { ...parts, [key]: partValue };
    // 월이나 연도를 바꿔 그 달에 없는 날이 되면 일을 다시 고르게 한다.
    if (next.month && next.day) {
      const lastDay = daysInMonth(next.year ? Number(next.year) : null, Number(next.month));
      if (Number(next.day) > lastDay) next.day = "";
    }
    setParts(next);
    onChange(composeDate(next));
  };

  const status = describeBirthDate(value, now);
  const showError =
    status.kind === "invalid" || (status.kind === "incomplete" && touched && mode === "text");
  const helpId = `${inputId}-help`;
  const statusId = `${inputId}-status`;
  const describedBy = [help ? helpId : null, statusId].filter(Boolean).join(" ");
  const dayCount = parts.month
    ? daysInMonth(parts.year ? Number(parts.year) : null, Number(parts.month))
    : 31;

  return (
    <div className="question">
      <div className="field-label-row">
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
        {labelAddon}
      </div>
      {help && (
        <p className="hint question-help" id={helpId}>
          {help}
        </p>
      )}

      {mode === "text" ? (
        <div className="birth-row">
          <input
            ref={textRef}
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="bday"
            placeholder="예: 19990315"
            maxLength={10}
            value={value}
            aria-invalid={showError}
            aria-describedby={describedBy}
            onChange={(event) => {
              setTouched(false);
              onChange(formatDateDigits(event.target.value));
            }}
            onBlur={() => setTouched(true)}
          />
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => switchMode("select")}
          >
            선택해서 입력
          </button>
        </div>
      ) : (
        <div className="birth-row">
          <div className="birth-selects" role="group" aria-label={`${label} 선택`}>
            <select
              ref={yearRef}
              id={inputId}
              aria-label="출생 연도"
              aria-describedby={describedBy}
              value={parts.year}
              onChange={(event) => updatePart("year", event.target.value)}
            >
              <option value="">연도</option>
              {birthYearGroups(now).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.years.map((year) => (
                    <option key={year} value={year}>
                      {year}년
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              aria-label="출생 월"
              value={parts.month}
              onChange={(event) => updatePart("month", event.target.value)}
            >
              <option value="">월</option>
              {MONTHS.map((month) => (
                <option key={month} value={month}>
                  {month}월
                </option>
              ))}
            </select>
            <select
              aria-label="출생 일"
              value={parts.day}
              onChange={(event) => updatePart("day", event.target.value)}
            >
              <option value="">일</option>
              {Array.from({ length: dayCount }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  {day}일
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => switchMode("text")}
          >
            직접 입력
          </button>
        </div>
      )}

      <p
        id={statusId}
        className={`field-hint${showError ? " is-not_met" : ""}`}
        aria-live="polite"
      >
        {showError && INVALID_BIRTH_DATE_MESSAGE}
        {status.kind === "valid" && `만 ${status.age}세로 계산했어요(${status.year}년생)`}
      </p>
      {status.kind === "valid" && children}
      {footer}
    </div>
  );
}
