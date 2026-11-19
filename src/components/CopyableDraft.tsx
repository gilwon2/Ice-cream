"use client";

import { useState } from "react";

type CopyableDraftProps = {
  title: string;
  initialText: string;
  copyLabel: string;
  helper: string;
  id?: string;
  /** true면 글이 아직 들어오는 중이라 편집과 복사를 막고 initialText를 그대로 보여준다. */
  streaming?: boolean;
};

export function CopyableDraft({
  title,
  initialText,
  copyLabel,
  helper,
  id = "draft-text",
  streaming = false,
}: CopyableDraftProps) {
  const [text, setText] = useState(initialText);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const shown = streaming ? initialText : text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div className="draft">
      <label className="field-label" htmlFor={id}>
        {title}
      </label>
      <textarea
        id={id}
        rows={13}
        value={shown}
        readOnly={streaming}
        aria-busy={streaming}
        onChange={(event) => {
          setText(event.target.value);
          setCopyState("idle");
        }}
      />
      <div className="draft-actions">
        <button type="button" className="button button-secondary" onClick={copy} disabled={streaming}>
          {copyLabel}
        </button>
        <span className="hint" role="status">
          {streaming && "AI가 초안을 쓰고 있어요. 다 쓰면 고치고 복사할 수 있어요."}
          {!streaming && copyState === "copied" && "복사했습니다."}
          {!streaming && copyState === "failed" && "복사하지 못했습니다. 내용을 직접 선택해 복사해 주세요."}
        </span>
      </div>
      <p className="hint">{helper}</p>
    </div>
  );
}
