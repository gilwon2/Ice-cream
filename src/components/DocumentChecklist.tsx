"use client";

import { useState } from "react";
import type { RequiredDocument } from "@/data/policies";
import { OfficialSiteNotice } from "./OfficialSiteNotice";

type DocumentChecklistProps = {
  documents: RequiredDocument[];
  checkedIds: string[];
  onToggle: (id: string) => void;
};

export function DocumentChecklist({ documents, checkedIds, onToggle }: DocumentChecklistProps) {
  const [openGuideId, setOpenGuideId] = useState<string | null>(null);

  return (
    <ul className="doc-list">
      {documents.map((document) => {
        const checked = checkedIds.includes(document.id);
        const guideOpen = openGuideId === document.id;
        const guideId = `guide-${document.id}`;

        return (
          <li key={document.id} className={`doc-row${checked ? " is-checked" : ""}`}>
            <div className="doc-main">
              <label className="doc-check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(document.id)}
                />
                <span>{document.label}</span>
              </label>

              {checked ? (
                <span className="doc-done">준비 완료</span>
              ) : document.issuer ? (
                <div className="doc-action">
                  <a
                    className="doc-link"
                    href={document.issuer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {document.issuer.name}에서 발급 <span aria-hidden="true">↗</span>
                    <span className="sr-only">(새 탭에서 열림)</span>
                  </a>
                  <OfficialSiteNotice />
                </div>
              ) : (
                <button
                  type="button"
                  className="doc-link"
                  aria-expanded={guideOpen}
                  aria-controls={guideId}
                  onClick={() => setOpenGuideId(guideOpen ? null : document.id)}
                >
                  준비 방법 {guideOpen ? "닫기" : "보기"}
                </button>
              )}
            </div>

            {!checked && !document.issuer && guideOpen && (
              <p className="doc-guide" id={guideId}>
                {document.guide}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
