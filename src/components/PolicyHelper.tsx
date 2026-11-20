"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { POLICIES } from "@/data/policies";
import { diagnose } from "@/lib/diagnosis";
import { progressDescription, progressSummary } from "@/lib/resultSummary";
import type { Answers } from "@/lib/rules";
import { scrollToElement } from "@/lib/scrollToElement";
import {
  furthestAfterPolicyChange,
  reachableStep,
  RESULT_STEP,
  SITUATION_STEP,
} from "@/lib/stepNavigation";
import { AiAccessProvider } from "./AiAccessProvider";
import { AiBadge } from "./AiBadge";
import { ProgressSidebar } from "./ProgressSidebar";
import { Stepper } from "./Stepper";
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
  const [answers, setAnswers] = useState<Answers>({});
  const [checkedDocumentIds, setCheckedDocumentIds] = useState<string[]>([]);
  const [inquiryTopic, setInquiryTopic] = useState("");
  /** 설명 카드에서 문의하겠다고 고른 조건 */
  const [inquiryRuleIds, setInquiryRuleIds] = useState<string[]>([]);
  const [focusInquiry, setFocusInquiry] = useState(false);
  /** 상황 확인·해결 안내에서 설명 카드를 열어 본 조건 */
  const [viewedRuleIds, setViewedRuleIds] = useState<string[]>([]);
  const markExplanationViewed = useCallback((ruleId: string) => {
    setViewedRuleIds((current) => (current.includes(ruleId) ? current : [...current, ruleId]));
  }, []);
  const [note, setNote] = useState("");
  /** Stepper가 STEP 02(상황 확인)를 거치지 않고 03으로 건너뛰지 못하게 실제 도달한 가장 먼 단계 */
  const [furthestStep, setFurthestStep] = useState(0);
  /** 단계 스크롤 효과에서 읽기 위한 focusInquiry 사본(이벤트 핸들러에서만 바꾼다) */
  const focusInquiryRef = useRef(false);

  /** 설명 카드에서 고른 조건을 문의문에 넣고, 결과 화면이 문의문으로 옮기게 한다. */
  const requestInquiry = useCallback((ruleId: string) => {
    setInquiryRuleIds((current) => (current.includes(ruleId) ? current : [...current, ruleId]));
    focusInquiryRef.current = true;
    setFocusInquiry(true);
  }, []);
  const inquiryFocused = useCallback(() => {
    focusInquiryRef.current = false;
    setFocusInquiry(false);
  }, []);

  const panelRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  const policy = POLICIES.find((item) => item.id === policyId) ?? null;

  const diagnosis = useMemo(
    () =>
      policy && now
        ? diagnose({ policy, answers, checkedDocumentIds, now })
        : null,
    [policy, answers, checkedDocumentIds, now],
  );
  const progress = diagnosis ? progressSummary(diagnosis) : null;

  // 단계가 바뀌면 새 패널 제목이 상단 진행률 바 바로 아래에 오도록 스크롤한다.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    // 설명 카드에서 문의문으로 바로 가는 경우에는 결과 화면이 문의문으로 포커스·스크롤한다.
    // 두 스크롤이 겹치면 서로 애니메이션을 끊으므로 여기서는 하지 않는다.
    if (step === RESULT_STEP && focusInquiryRef.current) return;
    panel.focus({ preventScroll: true });
    return scrollToElement(panel);
  }, [step, situationPage]);

  const goTo = (next: number) => {
    setStep(next);
    setFurthestStep((current) => Math.max(current, next));
  };

  const selectPolicy = (id: string) => {
    if (id === policyId) return;
    setPolicyId(id);
    setFurthestStep(furthestAfterPolicyChange);
    setSituationPage(0);
    setCheckedDocumentIds([]);
    setInquiryTopic("");
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

  const reachable = reachableStep({
    hasPolicy: Boolean(policy),
    furthest: furthestStep,
  });

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

      {/* STEP 02부터는 입력 영역이 바로 보이도록 히어로를 줄인다. */}
      <div className={`hero${step >= 1 ? " is-compact" : ""}`}>
        <div className="container">
          <h1>정책은 찾았는데, 신청에서 막혔나요?</h1>
          <p className="hero-lead">
            정책을 고르고 내 상황을 입력하면, 막힌 조건과 지금 할 수 있는 다음 행동을 알려드려요.
          </p>
          <p className="hero-ai">
            <AiBadge variant="inverse" />
            AI가 막힌 조건을 쉽게 풀어 주고, 기관 문의문까지 써 드려요.
          </p>
        </div>
      </div>

      {/* 모바일에서는 사이드바가 본문 아래로 내려가므로 진행률을 상단에 고정해 보여준다.
          정책을 고르는 STEP 01에서는 진행률이 의미 없어 보여주지 않는다. */}
      {progress && step >= 1 && (
        <a
          className="mobile-progress"
          href="#progress-panel"
          aria-label={`${progressDescription(progress)} 진행 상황으로 이동`}
          data-testid="mobile-progress"
        >
          {/* 자격은 개수로만, 서류는 n/m으로 보여준다. 숫자는 compactProgressLabel과 같다. */}
          <span className="mobile-progress-text" aria-hidden="true">
            자격{" "}
            <strong>
              {progress.eligibility.met}/{progress.eligibility.total}
            </strong>
            <span className="mobile-progress-sep"> · </span>
            서류{" "}
            <strong>
              {progress.documents.done}/{progress.documents.total}
            </strong>
          </span>
          {progress.eligibility.notMet + progress.eligibility.unknown > 0 && (
            <span className="mobile-progress-note" aria-hidden="true">
              {progress.eligibility.notMet > 0
                ? `미충족 가능성 ${progress.eligibility.notMet}`
                : `확인 필요 ${progress.eligibility.unknown}`}
            </span>
          )}
        </a>
      )}

      <div className="container page">
        <Stepper current={step} reachable={reachable} onSelect={goTo} />

        <div className="layout">
          <main className="panel" ref={panelRef} tabIndex={-1}>
            {step === 0 && (
              <PolicyStep
                selectedId={policyId}
                now={now}
                onSelect={selectPolicy}
                onNext={() => {
                  setSituationPage(0);
                  goTo(SITUATION_STEP);
                }}
              />
            )}
            {step === SITUATION_STEP && policy && diagnosis && now && (
              <SituationStep
                policy={policy}
                answers={answers}
                now={now}
                conditions={diagnosis.conditions}
                documents={diagnosis.documents}
                checkedDocumentIds={checkedDocumentIds}
                note={note}
                page={situationPage}
                onAnswer={answer}
                onToggleDocument={toggleDocument}
                onNoteChange={setNote}
                onPageChange={setSituationPage}
                onRequestInquiry={(ruleId) => {
                  requestInquiry(ruleId);
                  goTo(RESULT_STEP);
                }}
                onExplanationViewed={markExplanationViewed}
                onBack={() => goTo(0)}
                onNext={() => goTo(RESULT_STEP)}
              />
            )}
            {step === RESULT_STEP && policy && diagnosis && now && (
              <ResultStep
                policy={policy}
                diagnosis={diagnosis}
                answers={answers}
                now={now}
                checkedDocumentIds={checkedDocumentIds}
                inquiryTopic={inquiryTopic}
                note={note}
                onToggleDocument={toggleDocument}
                onInquiryTopicChange={setInquiryTopic}
                inquiryRuleIds={inquiryRuleIds}
                viewedRuleIds={viewedRuleIds}
                focusInquiry={focusInquiry}
                onInquiryFocused={inquiryFocused}
                onRequestInquiry={requestInquiry}
                onBack={() => goTo(SITUATION_STEP)}
              />
            )}
          </main>

          <ProgressSidebar policy={policy} diagnosis={diagnosis} showProgress={step >= 1} />
        </div>
      </div>
    </AiAccessProvider>
  );
}
