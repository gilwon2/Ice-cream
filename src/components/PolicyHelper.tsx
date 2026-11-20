"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { POLICIES } from "@/data/policies";
import { diagnose, type Blocker } from "@/lib/diagnosis";
import type { Answers } from "@/lib/rules";
import { AiAccessProvider } from "./AiAccessProvider";
import { AiBadge } from "./AiBadge";
import { ProgressSidebar } from "./ProgressSidebar";
import { Stepper } from "./Stepper";
import { BlockerStep } from "./steps/BlockerStep";
import { PolicyStep } from "./steps/PolicyStep";
import { ResultStep } from "./steps/ResultStep";
import { SituationStep } from "./steps/SituationStep";

/**
 * 페이지는 빌드할 때 미리 렌더링되므로, 접수 기간 판정에 쓰는 현재 시각은
 * 브라우저에서만 읽는다. 서버 렌더링 결과와 어긋나지 않도록 서버에서는 null이다.
 */
let pageOpenedAt: Date | undefined;
const subscribeNothing = () => () => {};
const getClientNow = () => (pageOpenedAt ??= new Date());
const getServerNow = () => null;

export function PolicyHelper() {
  const now = useSyncExternalStore(subscribeNothing, getClientNow, getServerNow);
  const [step, setStep] = useState(0);
  const [situationPage, setSituationPage] = useState(0);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [checkedDocumentIds, setCheckedDocumentIds] = useState<string[]>([]);
  const [inquiryTopic, setInquiryTopic] = useState("");
  const [inquiryResolved, setInquiryResolved] = useState(false);
  /** 설명 카드에서 문의하겠다고 고른 조건 */
  const [inquiryRuleIds, setInquiryRuleIds] = useState<string[]>([]);
  const [focusInquiry, setFocusInquiry] = useState(false);
  /** 3단계에서 설명 카드를 열어 본 조건 */
  const [viewedRuleIds, setViewedRuleIds] = useState<string[]>([]);
  const markExplanationViewed = useCallback((ruleId: string) => {
    setViewedRuleIds((current) => (current.includes(ruleId) ? current : [...current, ruleId]));
  }, []);
  const [note, setNote] = useState("");

  /** 설명 카드에서 고른 조건을 문의문에 넣고, 결과 화면이 문의문으로 옮기게 한다. */
  const requestInquiry = useCallback((ruleId: string) => {
    setInquiryRuleIds((current) => (current.includes(ruleId) ? current : [...current, ruleId]));
    setFocusInquiry(true);
  }, []);

  const panelRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  const policy = POLICIES.find((item) => item.id === policyId) ?? null;

  const diagnosis = useMemo(
    () =>
      policy && now
        ? diagnose({ policy, blocker, answers, checkedDocumentIds, inquiryResolved, now })
        : null,
    [policy, blocker, answers, checkedDocumentIds, inquiryResolved, now],
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    panelRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step, situationPage]);

  const selectPolicy = (id: string) => {
    if (id === policyId) return;
    setPolicyId(id);
    setSituationPage(0);
    setCheckedDocumentIds([]);
    setInquiryResolved(false);
    setInquiryRuleIds([]);
    setViewedRuleIds([]);
  };

  const answer = (questionId: string, value: string) =>
    setAnswers((current) => ({ ...current, [questionId]: value }));

  const toggleDocument = (id: string) => {
    setCheckedDocumentIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const reachableStep = !policy ? 0 : !blocker ? 1 : 3;

  return (
    // AI 기능이 생기면 useAiAccess().ensureAiAccess()로 동의와 접근 코드를 받는다.
    <AiAccessProvider>
      <header className="topbar">
        <div className="container topbar-inner">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">
              ✓
            </span>
            청년정책 신청 도우미
          </span>
        </div>
      </header>

      <div className="hero">
        <div className="container">
          <h1>정책은 찾았는데, 신청에서 막혔나요?</h1>
          <p>신청을 중단한 이유를 확인하고, 지금 할 수 있는 다음 행동을 찾아보세요.</p>
          <p className="hero-ai">
            <AiBadge variant="inverse" />
            AI가 막힌 조건을 쉽게 풀어 주고, 기관 문의문까지 써 드려요.
          </p>
        </div>
      </div>

      <div className="container page">
        <Stepper current={step} reachable={reachableStep} onSelect={setStep} />

        <div className="layout">
          <main className="panel" ref={panelRef} tabIndex={-1}>
            {step === 0 && (
              <PolicyStep
                selectedId={policyId}
                now={now}
                onSelect={selectPolicy}
                onNext={() => setStep(1)}
              />
            )}
            {step === 1 && (
              <BlockerStep
                selected={blocker}
                onSelect={setBlocker}
                onBack={() => setStep(0)}
                onNext={() => {
                  setSituationPage(0);
                  setStep(2);
                }}
              />
            )}
            {step === 2 && policy && blocker && diagnosis && now && (
              <SituationStep
                policy={policy}
                blocker={blocker}
                answers={answers}
                now={now}
                conditions={diagnosis.conditions}
                documents={diagnosis.documents}
                checkedDocumentIds={checkedDocumentIds}
                inquiryTopic={inquiryTopic}
                note={note}
                page={situationPage}
                onAnswer={answer}
                onToggleDocument={toggleDocument}
                onInquiryTopicChange={setInquiryTopic}
                onNoteChange={setNote}
                onPageChange={setSituationPage}
                onRequestInquiry={(ruleId) => {
                  requestInquiry(ruleId);
                  setStep(3);
                }}
                onExplanationViewed={markExplanationViewed}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && policy && blocker && diagnosis && now && (
              <ResultStep
                policy={policy}
                blocker={blocker}
                diagnosis={diagnosis}
                answers={answers}
                now={now}
                checkedDocumentIds={checkedDocumentIds}
                inquiryTopic={inquiryTopic}
                inquiryResolved={inquiryResolved}
                note={note}
                onToggleDocument={toggleDocument}
                onInquiryResolvedChange={setInquiryResolved}
                inquiryRuleIds={inquiryRuleIds}
                viewedRuleIds={viewedRuleIds}
                focusInquiry={focusInquiry}
                onInquiryFocused={() => setFocusInquiry(false)}
                onRequestInquiry={requestInquiry}
                onBack={() => setStep(2)}
              />
            )}
          </main>

          <ProgressSidebar policy={policy} diagnosis={diagnosis} />
        </div>
      </div>

      {diagnosis && (
        <a className="mobile-progress" href="#progress-panel">
          <span>신청 준비 {diagnosis.percent}%</span>
          <span className="meter" aria-hidden="true">
            <span style={{ width: `${diagnosis.percent}%` }} />
          </span>
        </a>
      )}
    </AiAccessProvider>
  );
}
