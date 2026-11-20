"use client";

import { useEffect, useRef, useState } from "react";
import { INQUIRY_TOPICS, type Policy } from "@/data/policies";
import { isConfirmedNotMet, type Diagnosis } from "@/lib/diagnosis";
import { buildDraftRequest } from "@/lib/ai/draftsShared";
import { buildInquiryDraft, buildProposalDraft } from "@/lib/drafts";
import { nextActions, type NextActionId } from "@/lib/nextActions";
import { countConditions } from "@/lib/resultSummary";
import type { Answers } from "@/lib/rules";
import { scrollToElement } from "@/lib/scrollToElement";
import { AiDraft } from "../AiDraft";
import { ApplyAction } from "../ApplyAction";
import { ConditionList } from "../ConditionList";
import { ContactActions } from "../ContactActions";
import { DocumentChecklist } from "../DocumentChecklist";
import { actionPanelId, actionTabId, NextActions } from "../NextActions";
import { ResultSummary } from "../ResultSummary";
import { SimilarPolicies } from "../SimilarPolicies";
import { SourceLink } from "../SourceLink";

/** 온통청년 청년신문고(정책 제안 창구). 제안문은 자동 제출하지 않고 사용자가 직접 붙여넣는다. */
const YOUTH_SINMUNGO_URL = "https://www.youthcenter.go.kr/youthJoin/ythJoinSinmungo";

/** 미충족일 때 "다음 행동" 카드가 옮겨 갈 영역 */
const JUMP_TARGET: Record<NextActionId, string> = {
  inquiry: "recheck",
  proposal: "proposal",
  prepare: "documents",
};

type ResultStepProps = {
  policy: Policy;
  diagnosis: Diagnosis;
  answers: Answers;
  now: Date;
  checkedDocumentIds: string[];
  inquiryTopic: string;
  note: string;
  onToggleDocument: (id: string) => void;
  onInquiryTopicChange: (topic: string) => void;
  /** 설명 카드에서 문의하겠다고 고른 조건 */
  inquiryRuleIds: string[];
  /** 설명 카드를 열어 본 조건 */
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
  diagnosis,
  answers,
  now,
  checkedDocumentIds,
  inquiryTopic,
  note,
  onToggleDocument,
  onInquiryTopicChange,
  inquiryRuleIds,
  viewedRuleIds,
  focusInquiry,
  onInquiryFocused,
  onRequestInquiry,
  onBack,
}: ResultStepProps) {
  const { application, route } = diagnosis;
  // 다음 행동은 사용자가 고른 이유가 아니라 판정 결과로 정한다.
  const plan = nextActions(diagnosis);
  const isIneligible = route === "INELIGIBLE";
  // 설명 카드에서 문의문으로 넘어왔으면 문의를 열어 둔다.
  const [selected, setSelected] = useState<NextActionId>(
    focusInquiry ? "inquiry" : plan.recommended,
  );
  // 판정이 바뀌어 고른 행동이 선택지에서 빠지면 추천으로 돌아간다.
  const current = plan.options.includes(selected) ? selected : plan.recommended;

  const applicable = diagnosis.conditions.filter(
    (condition) => condition.status !== "NOT_APPLICABLE",
  );
  const unverifiedCount = applicable.filter((condition) => !condition.verified).length;
  const blocked = diagnosis.conditions.filter(isConfirmedNotMet);
  const counts = countConditions(diagnosis.conditions);
  const hasBlocked = counts.notMet + counts.unknown > 0;

  // 미충족이면 막힌 조건을 기준 재확인 문의 대상으로 함께 넣는다.
  const focusRuleIds = [...new Set([...inquiryRuleIds, ...plan.inquiryFocusRuleIds])];
  const proposal = buildProposalDraft(policy, diagnosis.conditions, note);
  const inquiry = buildInquiryDraft(policy, inquiryTopic, note, diagnosis.conditions, focusRuleIds);
  // AI에는 조건 ID, 상태, 설명을 봤는지만 보낸다. 입력값, 메모, 문의 주제는 보내지 않는다.
  const proposalRequest = buildDraftRequest("proposal", policy, diagnosis.conditions, viewedRuleIds);
  const inquiryRequest = buildDraftRequest(
    "inquiry",
    policy,
    diagnosis.conditions,
    viewedRuleIds,
    focusRuleIds,
  );
  const inquiryRef = useRef<HTMLElement>(null);

  // 설명 카드에서 넘어왔으면 패널 대신 문의문으로 바로 옮긴다.
  // (PolicyHelper는 이때 패널 스크롤을 하지 않아 두 애니메이션이 서로 끊지 않는다.)
  useEffect(() => {
    const target = inquiryRef.current;
    if (!focusInquiry || !target) return;
    target.focus({ preventScroll: true });
    return scrollToElement(target, onInquiryFocused);
  }, [focusInquiry, onInquiryFocused]);

  const requestInquiry = (ruleId: string) => {
    setSelected("inquiry");
    onRequestInquiry(ruleId);
  };

  const jumpTo = (id: NextActionId) => {
    const target = document.getElementById(JUMP_TARGET[id]);
    if (!target) return;
    target.focus({ preventScroll: true });
    scrollToElement(target);
  };

  const inquiryBody = (
    <>
      {policy.contact && <p className="muted">문의처: {policy.contact}</p>}
      <div className="inquiry-topic">
        <p className="field-label" id="inquiry-topic-label">
          물어볼 주제 (선택)
        </p>
        <div className="pill-group" role="radiogroup" aria-labelledby="inquiry-topic-label">
          {INQUIRY_TOPICS.map((topic) => (
            <label key={topic} className={`pill${inquiryTopic === topic ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="inquiry-topic"
                checked={inquiryTopic === topic}
                onChange={() => onInquiryTopicChange(topic)}
              />
              {topic}
            </label>
          ))}
        </div>
      </div>
      <AiDraft
        request={inquiryRequest}
        template={inquiry}
        note={note}
        textareaId="draft-text"
        title="기관 문의문"
        aiTitle="기관 문의문 초안"
        copyLabel="문의문 복사"
        helper="내용을 검토한 뒤 공식 상담 채널에 직접 문의해 주세요."
        actions={<ContactActions policy={policy} />}
      />
      <p className="hint">확인한 내용으로 상황 확인 단계의 답을 고치면 바로 다시 판정해요.</p>
    </>
  );

  const prepareBody = (
    <>
      <p className="muted">
        {diagnosis.missingDocuments.length > 0
          ? `남은 서류 ${diagnosis.missingDocuments.length}개를 준비한 뒤 체크하면 진행률에 바로 반영돼요.`
          : "서류를 모두 체크했어요. 공식 사이트에서 최종 확인한 뒤 신청해 주세요."}
      </p>
      <DocumentChecklist
        documents={diagnosis.documents}
        checkedIds={checkedDocumentIds}
        onToggle={onToggleDocument}
      />
      <ApplyAction policy={policy} diagnosis={diagnosis} />
    </>
  );

  const closingNotes = (
    <>
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

      <p className="notice">
        이 결과는 공식 안내를 바탕으로 입력값만 비교한 모의 판정이에요. 실제 자격과 제출서류는 공식
        기관이 공적자료를 조회해 심사로 확정하므로 반드시 공식 기관에서 확인해 주세요.
      </p>
    </>
  );

  return (
    <>
      <p className="eyebrow">STEP 03</p>
      <h2 className="panel-title">해결 안내</h2>

      <ResultSummary policy={policy} diagnosis={diagnosis} />

      {/* 막힌 조건을 요약 바로 아래에 둔다. 충족·해당 없음 조건은 ConditionList 안에서 접힌다. */}
      <section className="section result-conditions" aria-labelledby="conditions-title">
        <h3 id="conditions-title">{hasBlocked ? "막힌 조건" : "조건별 판정"}</h3>
        <p className="muted">카드를 누르면 기준, 입력, 출처, 확인 방법을 볼 수 있어요.</p>
        <ConditionList
          policy={policy}
          conditions={diagnosis.conditions}
          answers={answers}
          now={now}
          onRequestInquiry={requestInquiry}
        />
        {unverifiedCount > 0 && (
          <p className="callout callout-small">
            &lsquo;확인 중인 기준&rsquo; {unverifiedCount}개는 공고 원문으로 아직 확인하지 못했어요.
            이 기준에 맞지 않아도 미충족으로 확정하지 않고 확인 필요로 표시해요.
          </p>
        )}
      </section>

      <section className="section result-action" aria-labelledby="next-actions-title">
        <h3 id="next-actions-title">다음 행동 선택</h3>
        <NextActions
          plan={plan}
          mode={isIneligible ? "jump" : "tabs"}
          selected={current}
          onSelect={isIneligible ? jumpTo : setSelected}
        />

        {!isIneligible && (
          <section
            className="action-panel"
            id={actionPanelId(current)}
            role="tabpanel"
            aria-labelledby={actionTabId(current)}
            ref={current === "inquiry" ? inquiryRef : undefined}
            tabIndex={-1}
          >
            {current === "inquiry" ? inquiryBody : prepareBody}
          </section>
        )}
      </section>

      {isIneligible ? (
        <>
          {/* 미충족: 당장 받을 수 있는 도움(기준 재확인 → 다른 지원 경로)을 먼저, 건의는 맨 아래에 둔다. */}
          <section
            className="section result-action"
            id="recheck"
            ref={inquiryRef}
            tabIndex={-1}
            aria-labelledby="recheck-title"
          >
            <h3 id="recheck-title">기준을 다시 확인할 방법</h3>
            <ul className="recheck-list">
              {blocked.map((condition) => (
                <li key={condition.ruleId}>
                  <strong>{condition.label}</strong>
                  <ul>
                    {condition.howToCheck.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <h4 className="action-subtitle">기관에 문의하기</h4>
            {inquiryBody}
            <ApplyAction policy={policy} diagnosis={diagnosis} />
          </section>

          <section className="section" aria-labelledby="alternatives-title">
            <h3 id="alternatives-title">다른 지원 경로</h3>
            <p className="muted">이 정책 대신 받을 수 있는 다른 도움도 살펴보세요.</p>
            {policy.alternative && (
              <div className="alternative-box">
                <h4>{policy.alternative.title}</h4>
                <ul className="plain-list">
                  {policy.alternative.body.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="hint">
                  출처: <SourceLink source={policy.alternative.source} />
                </p>
              </div>
            )}
          </section>
          <SimilarPolicies policyId={policy.id} />

          {closingNotes}

          <section
            className="section result-action"
            id="proposal"
            tabIndex={-1}
            aria-labelledby="proposal-title"
          >
            <h3 id="proposal-title">원하면 정책 개선을 건의할 수 있어요</h3>
            <p className="muted">제도의 기준 때문에 어려움을 겪고 있다면 의견을 낼 수 있어요.</p>
            <AiDraft
              request={proposalRequest}
              template={proposal}
              note={note}
              textareaId="proposal-text"
              title="정책 개선 건의문 예시"
              aiTitle="정책 개선 건의문 초안"
              copyLabel="건의문 복사"
              helper="내용을 검토하고 수정한 뒤 공식 의견제출 채널에 직접 제출해 주세요. 자동으로 제출되지 않아요."
              actions={
                <a
                  className="button button-secondary"
                  href={YOUTH_SINMUNGO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  청년신문고에 의견 내기 <span aria-hidden="true">↗</span>
                  <span className="sr-only">(새 탭에서 열림)</span>
                </a>
              }
            />
            <p className="hint">
              작성한 건의문을 복사해서 붙여넣으세요 · 온통청년 로그인이 필요할 수 있어요
            </p>
          </section>
        </>
      ) : (
        <>
          {closingNotes}
          <SimilarPolicies policyId={policy.id} />
        </>
      )}

      <div className="actions">
        <button type="button" className="button button-ghost" onClick={onBack}>
          ← 상황 다시 확인
        </button>
      </div>
    </>
  );
}
