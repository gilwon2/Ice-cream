"use client";

import { useState } from "react";

type CopyableDraftProps = {
  title: string;
  initialText: string;
  copyLabel: string;
  helper: string;
};

export function CopyableDraft({ title, initialText, copyLabel, helper }: CopyableDraftProps) {
  const [text, setText] = useState(initialText);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

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
      <label className="field-label" htmlFor="draft-text">
        {title}
      </label>
      <textarea
        id="draft-text"
        rows={13}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setCopyState("idle");
        }}
      />
      <div className="draft-actions">
        <button type="button" className="button button-secondary" onClick={copy}>
          {copyLabel}
        </button>
        <span className="hint" role="status">
          {copyState === "copied" && "복사했습니다."}
          {copyState === "failed" && "복사하지 못했습니다. 내용을 직접 선택해 복사해 주세요."}
        </span>
      </div>
      <p className="hint">{helper}</p>
    </div>
  );
}
