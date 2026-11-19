"use client";

import { useEffect, useMemo, useState } from "react";
import type { Policy } from "@/data/policies";
import { browserSessionStorage } from "@/lib/ai/access";
import {
  createExplanationCache,
  requestExplanation,
  type ExplanationResult,
} from "@/lib/ai/explainClient";
import { buildExplainRequest, explainCacheKey, type ExplainRequest } from "@/lib/ai/explainShared";
import { evaluationContext } from "@/lib/diagnosis";
import { previewOutcomes, type Answers, type Rule } from "@/lib/rules";
import { useAiAccess } from "./AiAccessProvider";
import { STATUS_LABEL } from "./ConditionList";
import { SourceLink } from "./SourceLink";

export type ExplanationTarget = {
  policy: Policy;
  rule: Rule;
  answers: Answers;
  onRequestInquiry: (ruleId: string) => void;
  /** 카드를 열어 본 조건을 기록한다(초안 요청의 "설명을 봤는지"). */
  onViewed?: (ruleId: string) => void;
};

type ExplanationCardProps = ExplanationTarget & {
  id: string;
  now: Date;
  onClose: () => void;
};

/**
 * 조건 설명 카드. 4칸 구성은 고정이다.
 * ①②③④는 규칙 데이터와 계산 결과로 즉시 보여주고, AI 문장은 ① 아래에 뒤따라 붙는다.
 */
export function ExplanationCard({
  id,
  policy,
  rule,
  answers,
  now,
  onRequestInquiry,
  onViewed,
  onClose,
}: ExplanationCardProps) {
  useEffect(() => {
    onViewed?.(rule.id);
  }, [onViewed, rule.id]);

  const request = buildExplainRequest(policy, rule, answers);
  // ③은 AI가 아니라 previewOutcomes 계산 결과를 그대로 쓴다.
  const outcomes = previewOutcomes(rule, evaluationContext(policy, answers, now)).filter(
    (preview) => preview.label !== "미입력",
  );

  return (
    <section id={id} className="explain-card" aria-label={`${rule.label} 설명`}>
      <div className="explain-head">
        <strong>{rule.label} 알아보기</strong>
        <button type="button" className="explain-close" onClick={onClose} aria-label="설명 닫기">
          닫기
        </button>
      </div>

      <div className="explain-block">
        <h4>① 쉬운 뜻</h4>
        <p>{rule.plainText}</p>
        {!rule.verified && <span className="tag">확인 중인 기준</span>}
        {/* 같은 규칙·같은 조건 값이면 같은 키라 저장된 설명을 다시 쓴다. */}
        <AiNote key={explainCacheKey(request)} request={request} />
      </div>

      <div className="explain-block">
        <h4>② 확인하는 방법</h4>
        <ul>
          {rule.howToCheck.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <p className="hint">
          출처: <SourceLink source={rule.source} />
        </p>
      </div>

      <div className="explain-block">
        <h4>③ 답에 따라 달라지는 결과</h4>
        <ul className="explain-outcomes">
          {outcomes.map((outcome) => (
            <li key={outcome.label}>
              <strong>{outcome.label}</strong>
              <span className={`status is-${outcome.status.toLowerCase()}`}>
                {STATUS_LABEL[outcome.status]}
              </span>
              <span className="muted">{outcome.reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="explain-block">
        <h4>④ 그래도 모르겠다면</h4>
        <p>기관에 직접 물어보는 게 가장 정확해요. 이 조건을 넣은 문의문을 만들어 드릴게요.</p>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => onRequestInquiry(rule.id)}
        >
          문의문 작성으로 이동 →
        </button>
      </div>
    </section>
  );
}

type NoteState = { kind: "loading" } | ExplanationResult;

/** AI 맞춤 설명 한 줄. 어떤 경우에도 빈칸을 남기지 않는다. */
function AiNote({ request }: { request: ExplainRequest }) {
  const { store, ensureAiAccess } = useAiAccess();
  const cache = useMemo(() => createExplanationCache(browserSessionStorage), []);
  // 카드는 조건 값이 바뀌면 key가 바뀌어 새로 만들어지므로 처음 받은 요청만 쓴다.
  const [fixedRequest] = useState(request);
  const [state, setState] = useState<NoteState>(() => {
    const cached = cache.get(explainCacheKey(request));
    if (cached) return { kind: "ready", note: cached, cached: true };
    return store.hasConsent() && store.getAccessCode() ? { kind: "loading" } : { kind: "no_access" };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state.kind !== "loading") return;
    let active = true;
    requestExplanation(fixedRequest, { store, cache }).then((result) => {
      if (active) setState(result);
    });
    return () => {
      active = false;
    };
    // 상태가 loading으로 바뀔 때(처음 또는 다시 시도)만 요청한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, fixedRequest, store, cache]);

  const startWithAccess = async () => {
    if (!(await ensureAiAccess())) return;
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  };

  if (state.kind === "ready") {
    return (
      <p className="ai-note">
        <span className="ai-badge">AI</span>
        {state.note}
      </p>
    );
  }
  if (state.kind === "loading") {
    return (
      <p className="ai-note is-loading" role="status">
        내 상황에 맞춘 설명을 준비하고 있어요…
      </p>
    );
  }
  if (state.kind === "no_access" || state.needsCode) {
    return (
      <div className="ai-note-action">
        {state.kind === "failed" && <p className="hint">{state.message}</p>}
        <button type="button" className="button button-ghost button-small" onClick={startWithAccess}>
          {state.kind === "failed" ? "접근 코드 다시 입력" : "내 상황에 맞춘 설명 보기 (AI)"}
        </button>
      </div>
    );
  }
  return <p className="hint ai-note-fallback">{state.message}</p>;
}
