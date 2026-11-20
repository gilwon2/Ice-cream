"use client";

import { useEffect, useRef } from "react";
import type { Policy } from "@/data/policies";
import { shouldShowInquiry, type Blocker, type Diagnosis, type Route } from "@/lib/diagnosis";
import { buildDraftRequest } from "@/lib/ai/draftsShared";
import { buildInquiryDraft, buildProposalDraft } from "@/lib/drafts";
import type { Answers } from "@/lib/rules";
import { scrollToElement } from "@/lib/scrollToElement";
import { AiDraft } from "../AiDraft";
import { ApplyAction } from "../ApplyAction";
import { ConditionList } from "../ConditionList";
import { DocumentChecklist } from "../DocumentChecklist";
import { ResultSummary } from "../ResultSummary";
import { SourceLink } from "../SourceLink";

/** 요약 카드의 주 버튼이 옮겨 갈 다음 행동 영역 */
const ACTION_TARGET: Record<Route, string> = {
  NEEDS_INQUIRY: "inquiry",
  INELIGIBLE: "proposal",
  ACTION_REQUIRED: "documents",
  READY: "apply",
};

type ResultStepProps = {
  policy: Policy;
  blocker: Blocker;
  diagnosis: Diagnosis;
  answers: Answers;
  now: Date;
  checkedDocumentIds: string[];
  inquiryTopic: string;
  inquiryResolved: boolean;
  note: string;
  onToggleDocument: (id: string) => void;
  onInquiryResolvedChange: (resolved: boolean) => void;
  /** 설명 카드에서 문의하겠다고 고른 조건 */
  inquiryRuleIds: string[];
  /** 3단계에서 설명 카드를 열어 본 조건 */
  viewedRuleIds: string[];
  /** true면 결과 화면을 열자마자 문의문으로 이동한다. */
  focusInquiry: boolean;
  onInquiryFocused: () => void;
  /** 조건 카드의 설명에서 "문의문 작성으로 이동"을 누르면 부른다. */
  onRequestInquiry: (ruleId: string) => void;
  onBack: () => void;
};

export function ResultStep({
  policy,
  blocker,
  diagnosis,
  answers,
  now,
  checkedDocumentIds,
  inquiryTopic,
  inquiryResolved,
  note,
  onToggleDocument,
  onInquiryResolvedChange,
  inquiryRuleIds,
  viewedRuleIds,
  focusInquiry,
  onInquiryFocused,
  onRequestInquiry,
  onBack,
}: ResultStepProps) {
  const { application, route } = diagnosis;
  const applicable = diagnosis.conditions.filter(
    (condition) => condition.status !== "NOT_APPLICABLE",
  );
  const unverifiedCount = applicable.filter((condition) => !condition.verified).length;
  const hasUnknown = applicable.some((condition) => condition.status === "UNKNOWN");

  const proposal = buildProposalDraft(policy, diagnosis.conditions, note);
  const inquiry = buildInquiryDraft(
    policy,
    inquiryTopic,
    note,
    diagnosis.conditions,
    inquiryRuleIds,
  );
  // AI에는 조건 ID, 상태, 설명을 봤는지만 보낸다. 입력값과 메모는 보내지 않는다.
  const proposalRequest = buildDraftRequest("proposal", policy, diagnosis.conditions, viewedRuleIds);
  const inquiryRequest = buildDraftRequest(
    "inquiry",
    policy,
    diagnosis.conditions,
    viewedRuleIds,
    inquiryRuleIds,
  );
  const showInquiry = shouldShowInquiry(blocker, route) || inquiryRuleIds.length > 0;
  const inquiryRef = useRef<HTMLElement>(null);

  // 설명 카드에서 넘어왔으면 패널 대신 문의문으로 바로 옮긴다.
  // (PolicyHelper는 이때 패널 스크롤을 하지 않아 두 애니메이션이 서로 끊지 않는다.)
  useEffect(() => {
    const target = inquiryRef.current;
    if (!focusInquiry || !target) return;
    target.focus({ preventScroll: true });
    return scrollToElement(target, onInquiryFocused);
  }, [focusInquiry, onInquiryFocused]);

  const goToAction = () => {
    const target = document.getElementById(ACTION_TARGET[route]);
    if (!target) return;
    target.focus({ preventScroll: true });
    scrollToElement(target);
  };

  const inquirySection = (
    <section
      className="section result-action"
      id="inquiry"
      ref={inquiryRef}
      tabIndex={-1}
      aria-labelledby="inquiry-title"
    >
      <h3 id="inquiry-title">공식 기관 문의</h3>
      {policy.contact && <p className="muted">문의처: {policy.contact}</p>}
      <AiDraft
        request={inquiryRequest}
        template={inquiry}
        note={note}
        textareaId="draft-text"
        title="기관 문의문"
        aiTitle="기관 문의문 초안"
        copyLabel="문의문 복사"
        helper="내용을 검토한 뒤 공식 상담 채널에 직접 문의해 주세요."
      />
      {blocker === "unclear" ? (
        <label className="confirm-check">
          <input
            type="checkbox"
            checked={inquiryResolved}
            onChange={(event) => onInquiryResolvedChange(event.target.checked)}
          />
          <span>공식 기관에 문의해 해당 조건을 충족한다고 확인했어요</span>
        </label>
      ) : (
        <p className="hint">확인한 내용으로 이전 단계의 답을 고치면 바로 다시 판정해요.</p>
      )}
    </section>
  );

  return (
    <>
      <p className="eyebrow">STEP 04</p>
      <h2 className="panel-title">진단 결과</h2>

      <ResultSummary policy={policy} diagnosis={diagnosis} onAction={goToAction} />

      {/* 다음 행동 영역: 요약 카드 바로 아래에 둔다. */}
      {route === "NEEDS_INQUIRY" && inquirySection}

      {route === "INELIGIBLE" && (
        <section
          className="section result-action"
          id="proposal"
          tabIndex={-1}
          aria-labelledby="proposal-title"
        >
          <h3 id="proposal-title">정책 개선 제안</h3>
          <p className="muted">제도의 기준 때문에 어려움을 겪고 있다면 의견을 제안할 수 있어요.</p>
          <AiDraft
            request={proposalRequest}
            template={proposal}
            note={note}
            textareaId="proposal-text"
            title="정책 개선 제안문 예시"
            aiTitle="정책 개선 제안문 초안"
            copyLabel="제안문 복사"
            helper="내용을 검토하고 수정한 뒤 공식 의견제출 채널에 직접 제출해 주세요. 자동으로 제출되지 않아요."
          />
        </section>
      )}

      {route === "ACTION_REQUIRED" && (
        <section
          className="section result-action"
          id="documents"
          tabIndex={-1}
          aria-labelledby="documents-title"
        >
          <h3 id="documents-title">남은 서류 {diagnosis.missingDocuments.length}개</h3>
          <p className="muted">서류를 준비한 뒤 체크하면 진행률에 바로 반영돼요.</p>
          <DocumentChecklist
            documents={diagnosis.documents}
            checkedIds={checkedDocumentIds}
            onToggle={onToggleDocument}
          />
        </section>
      )}

      {route === "READY" && (
        <section className="section result-action" id="apply" tabIndex={-1} aria-label="신청하기">
          <ApplyAction policy={policy} diagnosis={diagnosis} />
        </section>
      )}

      {route !== "NEEDS_INQUIRY" && showInquiry && inquirySection}

      {route === "INELIGIBLE" && policy.alternative && (
        <section className="section">
          <h3>{policy.alternative.title}</h3>
          <ul className="plain-list">
            {policy.alternative.body.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="hint">
            출처: <SourceLink source={policy.alternative.source} />
          </p>
        </section>
      )}

      {route === "NEEDS_INQUIRY" && hasUnknown && (
        <section className="section">
          <p className="callout">
            확인이 필요한 조건이 있어요. 아래 조건 카드를 펼쳐 확인 방법을 보거나, 위 문의문으로
            기관에 물어본 뒤 이전 단계에서 다시 입력하면 바로 다시 판정해요.
          </p>
        </section>
      )}

      {application.status !== "open" && (
        <section className="section">
          <div className="closed-box">
            <strong>{application.title}</strong>
            <p className="muted">{application.label}</p>
            {policy.closedGuide && (
              <>
                <p className="closed-subtitle">다음 공고 대비 안내</p>
                <ul>
                  {policy.closedGuide.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      {diagnosis.advisories.length > 0 && (
        <section className="section">
          {diagnosis.advisories.map((advisory) => (
            <p key={advisory.id} className="callout">
              {advisory.text}
            </p>
          ))}
        </section>
      )}

      <section className="section">
        <h3>조건별 판정</h3>
        <p className="muted">카드를 누르면 기준, 입력, 출처, 확인 방법을 볼 수 있어요.</p>
        {unverifiedCount > 0 && (
          <p className="callout callout-small">
            &lsquo;확인 중인 기준&rsquo; {unverifiedCount}개는 공고 원문으로 아직 확인하지 못했어요.
            이 기준에 맞지 않아도 미충족으로 확정하지 않고 확인 필요로 표시해요.
          </p>
        )}
        <ConditionList
          policy={policy}
          conditions={diagnosis.conditions}
          answers={answers}
          now={now}
          onRequestInquiry={onRequestInquiry}
        />
      </section>

      <p className="notice">
        이 결과는 공식 안내를 바탕으로 입력값만 비교한 모의 판정이에요. 실제 자격과 제출서류는 공식
        기관이 공적자료를 조회해 심사로 확정하므로 반드시 공식 기관에서 확인해 주세요.
      </p>

      <div className="actions">
        <button type="button" className="button button-ghost" onClick={onBack}>
          ← 상황 다시 확인
        </button>
      </div>
    </>
  );
}
