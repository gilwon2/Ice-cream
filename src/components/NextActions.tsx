"use client";

import type { KeyboardEvent } from "react";
import type { NextActionId, NextActionPlan } from "@/lib/nextActions";

type Copy = { title: string; description: string };

const COPY: Record<NextActionId, Copy> = {
  inquiry: {
    title: "기관에 문의하기",
    description: "AI 문의문을 쓰고 문의처에 바로 전화해요.",
  },
  proposal: {
    title: "정책 개선 건의하기",
    description: "AI 건의문을 쓰고 청년신문고에 의견을 내요.",
  },
  prepare: {
    title: "신청 준비",
    description: "서류를 체크하고 공식 신청 사이트로 가요.",
  },
};

/** 미충족일 때 문의는 "기준을 다시 확인"하는 용도라 이름을 바꿔 보여준다. */
const RECHECK_COPY: Copy = {
  title: "기준 다시 확인하기",
  description: "막힌 기준을 기관에 물어 다시 확인해요.",
};

export const actionTabId = (id: NextActionId) => `action-tab-${id}`;
export const actionPanelId = (id: NextActionId) => `action-panel-${id}`;

type NextActionsProps = {
  plan: NextActionPlan;
  /**
   * tabs: 고른 행동의 내용을 바로 아래 패널에 보여준다.
   * jump: 행동마다 영역이 따로 있어(미충족일 때) 누르면 그 영역으로 이동한다.
   */
  mode: "tabs" | "jump";
  selected: NextActionId;
  onSelect: (id: NextActionId) => void;
};

/**
 * 해결 안내의 "다음 행동 선택" 카드 줄.
 * 판정 결과에 맞는 행동(plan.recommended)에 "추천"을 달고, 다른 행동도 고를 수 있게 한다.
 */
export function NextActions({ plan, mode, selected, onSelect }: NextActionsProps) {
  const copyFor = (id: NextActionId) =>
    id === "inquiry" && plan.inquiryFocusRuleIds.length > 0 ? RECHECK_COPY : COPY[id];

  // 탭 사이를 좌우 화살표로 옮긴다(WAI-ARIA tabs 패턴).
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (mode !== "tabs") return;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = plan.options[(index + step + plan.options.length) % plan.options.length];
    onSelect(next);
    document.getElementById(actionTabId(next))?.focus();
  };

  return (
    <div
      className="next-actions"
      role={mode === "tabs" ? "tablist" : undefined}
      aria-label="다음 행동 선택"
    >
      {plan.options.map((id, index) => {
        const copy = copyFor(id);
        const isSelected = mode === "tabs" && id === selected;
        return (
          <button
            key={id}
            type="button"
            id={actionTabId(id)}
            className={`next-action${isSelected ? " is-selected" : ""}`}
            role={mode === "tabs" ? "tab" : undefined}
            aria-selected={mode === "tabs" ? isSelected : undefined}
            // 고른 패널만 그리므로 그 탭만 패널을 가리킨다.
            aria-controls={isSelected ? actionPanelId(id) : undefined}
            tabIndex={mode === "tabs" && !isSelected ? -1 : undefined}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="next-action-head">
              <strong>{copy.title}</strong>
              {id === plan.recommended && <span className="tag tag-recommend">추천</span>}
              {mode === "jump" && (
                <span className="next-action-arrow" aria-hidden="true">
                  ↓
                </span>
              )}
            </span>
            <span className="next-action-desc">{copy.description}</span>
          </button>
        );
      })}
    </div>
  );
}
