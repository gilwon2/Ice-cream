"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { POLICIES } from "@/data/policies";
import { diagnose, type Blocker, type Profile } from "@/lib/diagnosis";
import { ProgressSidebar } from "./ProgressSidebar";
import { Stepper } from "./Stepper";
import { BlockerStep } from "./steps/BlockerStep";
import { PolicyStep } from "./steps/PolicyStep";
import { ResultStep } from "./steps/ResultStep";
import { SituationStep } from "./steps/SituationStep";

const EMPTY_PROFILE: Profile = { age: "", region: "", monthlyIncome: "", status: "" };

export function PolicyHelper() {
  const [step, setStep] = useState(0);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [checkedDocumentIds, setCheckedDocumentIds] = useState<string[]>([]);
  const [inquiryTopic, setInquiryTopic] = useState("");
  const [inquiryResolved, setInquiryResolved] = useState(false);
  const [note, setNote] = useState("");

  const panelRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  const policy = POLICIES.find((item) => item.id === policyId) ?? null;

  const diagnosis = useMemo(
    () =>
      policy
        ? diagnose({ policy, blocker, profile, checkedDocumentIds, inquiryResolved })
        : null,
    [policy, blocker, profile, checkedDocumentIds, inquiryResolved],
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    panelRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const selectPolicy = (id: string) => {
    if (id === policyId) return;
    setPolicyId(id);
    setCheckedDocumentIds([]);
    setInquiryResolved(false);
  };

  const toggleDocument = (id: string) => {
    setCheckedDocumentIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const reachableStep = !policy ? 0 : !blocker ? 1 : 3;

  return (
    <>
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
        </div>
      </div>

      <div className="container page">
        <Stepper current={step} reachable={reachableStep} onSelect={setStep} />

        <div className="layout">
          <main className="panel" ref={panelRef} tabIndex={-1}>
            {step === 0 && (
              <PolicyStep
                selectedId={policyId}
                onSelect={selectPolicy}
                onNext={() => setStep(1)}
              />
            )}
            {step === 1 && (
              <BlockerStep
                selected={blocker}
                onSelect={setBlocker}
                onBack={() => setStep(0)}
                onNext={() => setStep(2)}
              />
            )}
            {step === 2 && policy && blocker && diagnosis && (
              <SituationStep
                policy={policy}
                blocker={blocker}
                profile={profile}
                conditions={diagnosis.conditions}
                checkedDocumentIds={checkedDocumentIds}
                inquiryTopic={inquiryTopic}
                note={note}
                onProfileChange={setProfile}
                onToggleDocument={toggleDocument}
                onInquiryTopicChange={setInquiryTopic}
                onNoteChange={setNote}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && policy && blocker && diagnosis && (
              <ResultStep
                policy={policy}
                blocker={blocker}
                diagnosis={diagnosis}
                checkedDocumentIds={checkedDocumentIds}
                inquiryTopic={inquiryTopic}
                inquiryResolved={inquiryResolved}
                note={note}
                onToggleDocument={toggleDocument}
                onInquiryResolvedChange={setInquiryResolved}
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
    </>
  );
}
