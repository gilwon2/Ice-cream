"use client";

import { useEffect, useRef, useState } from "react";
import type { Policy } from "@/data/policies";
import { shouldShowInquiry, type Blocker, type Diagnosis, type Route } from "@/lib/diagnosis";
import { buildDraftRequest } from "@/lib/ai/draftsShared";
import { buildInquiryDraft, buildProposalDraft } from "@/lib/drafts";
import { formatIsoDate, type Answers } from "@/lib/rules";
import { AiDraft } from "../AiDraft";
import { ApplyAction } from "../ApplyAction";
import { ConditionList } from "../ConditionList";
import { DocumentChecklist } from "../DocumentChecklist";
import { SourceLink } from "../SourceLink";

const ROUTE_COPY: Record<Route, { tone: string; label: string; title: string; body: string }> = {
  READY: {
    tone: "success",
    label: "신청 준비 항목 완료",
    title: "입력한 내용으로는 신청 준비를 마친 것으로 보여요",
    body: "최종 자격은 공식 기관의 심사로 결정돼요. 공식 사이트에서 조건, 신청기간, 접수 경로를 확인한 뒤 직접 신청해 주세요.",
  },
  ACTION_REQUIRED: {
    tone: "info",
    label: "해결 가능한 장애물",
    title: "입력한 조건은 충족하는 것으로 보여요",
    body: "아래 서류를 준비해 체크해 주세요. 최종 자격은 공식 기관의 심사로 결정돼요.",
  },
  INELIGIBLE: {
    tone: "danger",
    label: "자격 미충족 가능성",
    title: "입력한 내용으로는 충족하지 못한 것으로 보이는 조건이 있어요",
    body: "사유를 확인하고 다른 지원 가능성을 검토해 보세요. 원한다면 정책 개선 제안문을 작성할 수 있어요.",
  },
  NEEDS_INQUIRY: {
    tone: "warning",
    label: "추가 확인 필요",
    title: "아직 판단할 수 없는 조건이 있어요",
    body: "입력하지 않았거나, 모르겠다고 답했거나, 확인 중인 기준에 걸린 조건은 임의로 판정하지 않아요.",
  },
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
  onBack,
}: ResultStepProps) {
  const [showProposal, setShowProposal] = useState(false);
  const copy = ROUTE_COPY[diagnosis.route];
  const { application } = diagnosis;
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
  const showInquiry = shouldShowInquiry(blocker, diagnosis.route) || inquiryRuleIds.length > 0;
  const inquiryRef = useRef<HTMLElement>(null);

  // 설명 카드에서 넘어왔으면 단계 이동 스크롤이 끝난 뒤 문의문으로 옮긴다.
  useEffect(() => {
    if (!focusInquiry) return;
    const timer = window.setTimeout(() => {
      inquiryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      inquiryRef.current?.focus({ preventScroll: true });
      onInquiryFocused();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusInquiry, onInquiryFocused]);

  return (
    <>
      <p className="eyebrow">STEP 04</p>
      <h2 className="panel-title">진단 결과</h2>

      <div className={`result-banner is-${copy.tone}`} role="status">
        <span className="result-label">{copy.label}</span>
        <strong>{copy.title}</strong>
        <p>
          {diagnosis.route === "READY" && application.status !== "open"
            ? "지금은 접수 기간이 아니에요. 다음 공고가 나오면 기준을 다시 확인하고 신청하세요."
            : copy.body}
        </p>
        <p className="result-meta">
          공고 기준일 {formatIsoDate(policy.announcement.publishedAt)} ·{" "}
          <SourceLink
            source={{ name: policy.announcement.title, url: policy.announcement.url }}
          />{" "}
          · 정보 확인일 {formatIsoDate(policy.announcement.checkedAt)}
        </p>
      </div>

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
        />
      </section>

      {diagnosis.route === "ACTION_REQUIRED" && (
        <section className="section">
          <h3>남은 서류 {diagnosis.missingDocuments.length}개</h3>
          <p className="muted">서류를 준비한 뒤 체크하면 진행률에 바로 반영됩니다.</p>
          <DocumentChecklist
            documents={diagnosis.documents}
            checkedIds={checkedDocumentIds}
            onToggle={onToggleDocument}
          />
        </section>
      )}

      {diagnosis.route === "INELIGIBLE" && policy.alternative && (
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

      {diagnosis.route === "INELIGIBLE" && (
        <section className="section">
          <h3>정책 개선 제안</h3>
          <p className="muted">제도의 기준 때문에 어려움을 겪고 있다면 의견을 제안할 수 있습니다.</p>
          {showProposal ? (
            <AiDraft
              request={proposalRequest}
              template={proposal}
              note={note}
              textareaId="proposal-text"
              title="정책 개선 제안문 예시"
              aiTitle="정책 개선 제안문 초안"
              copyLabel="제안문 복사"
              helper="내용을 검토하고 수정한 뒤 공식 의견제출 채널에 직접 제출해 주세요. 자동으로 제출되지 않습니다."
            />
          ) : (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowProposal(true)}
            >
              정책 개선 제안문 예시 만들기
            </button>
          )}
        </section>
      )}

      {diagnosis.route === "NEEDS_INQUIRY" && hasUnknown && (
        <section className="section">
          <p className="callout">
            확인이 필요한 조건이 있어요. 위의 확인 방법을 참고하거나 아래 문의문으로 기관에 물어본
            뒤, 이전 단계에서 다시 입력하면 바로 다시 판정해요.
          </p>
        </section>
      )}

      {showInquiry && (
        <section className="section" id="inquiry" ref={inquiryRef} tabIndex={-1}>
          <h3>공식 기관 문의</h3>
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
            <p className="hint">
              확인한 내용으로 이전 단계의 답을 고치면 바로 다시 판정해요.
            </p>
          )}
        </section>
      )}

      {diagnosis.route === "READY" && (
        <section className="section">
          <ApplyAction policy={policy} diagnosis={diagnosis} />
        </section>
      )}

      <p className="notice">
        이 결과는 공식 안내를 바탕으로 입력값만 비교한 모의 판정입니다. 실제 자격과 제출서류는 공식
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
