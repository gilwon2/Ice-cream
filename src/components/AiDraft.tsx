"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSessionStorage } from "@/lib/ai/access";
import { requestDraft, type DraftResult } from "@/lib/ai/draftsClient";
import { draftCacheKey, fillSituation, type DraftRequest } from "@/lib/ai/draftsShared";
import { createExplanationCache } from "@/lib/ai/explainClient";
import { useAiAccess } from "./AiAccessProvider";
import { CopyableDraft } from "./CopyableDraft";

export const AI_DRAFT_NOTICE = "AI가 작성한 초안이에요. 보내기 전에 꼭 확인하세요";

type AiDraftProps = {
  /** null이면 AI에 넘길 조건이 없어 고정 템플릿만 보여준다. */
  request: DraftRequest | null;
  /** 지금의 고정 템플릿. AI가 없거나 실패하면 그대로 보여준다. */
  template: string;
  /** 사용자의 메모. 서버로 보내지 않고 브라우저에서 [상세 상황] 자리에만 넣는다. */
  note: string;
  title: string;
  aiTitle: string;
  copyLabel: string;
  helper: string;
  textareaId?: string;
};

/** AI 초안 영역. 어떤 경우에도 빈칸 없이 편집·복사할 수 있는 글을 보여준다. */
export function AiDraft({ request, template, ...rest }: AiDraftProps) {
  const templateDraft = (
    <CopyableDraft
      key={template}
      id={rest.textareaId}
      title={rest.title}
      initialText={template}
      copyLabel={rest.copyLabel}
      helper={rest.helper}
    />
  );
  if (!request) return templateDraft;
  // 요청(조건 목록)이 바뀌면 새로 만든다.
  return <AiDraftBody key={draftCacheKey(request)} request={request} template={template} {...rest} />;
}

type DraftState = { kind: "streaming"; text: string } | DraftResult;

function AiDraftBody({
  request,
  template,
  note,
  title,
  aiTitle,
  copyLabel,
  helper,
  textareaId,
}: AiDraftProps & { request: DraftRequest }) {
  const { store, ensureAiAccess } = useAiAccess();
  const cache = useMemo(() => createExplanationCache(browserSessionStorage), []);
  // 요청이 바뀌면 key가 바뀌어 새로 만들어지므로 처음 받은 요청만 쓴다.
  const [fixedRequest] = useState(request);
  const [state, setState] = useState<DraftState>(() => {
    const cached = cache.get(draftCacheKey(request));
    if (cached) return { kind: "ready", text: cached, cached: true, removed: 0 };
    return store.hasConsent() && store.getAccessCode() ? { kind: "streaming", text: "" } : { kind: "no_access" };
  });
  const [attempt, setAttempt] = useState(0);
  const streaming = state.kind === "streaming";

  useEffect(() => {
    if (!streaming) return;
    const controller = new AbortController();
    requestDraft(fixedRequest, {
      store,
      cache,
      signal: controller.signal,
      onText: (text) => {
        if (!controller.signal.aborted) setState({ kind: "streaming", text });
      },
    }).then((result) => {
      if (!controller.signal.aborted) setState(result);
    });
    return () => controller.abort();
    // 상태가 streaming으로 바뀔 때(처음 또는 다시 시도)만 요청한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, fixedRequest, store, cache]);

  const startWithAccess = async () => {
    if (!(await ensureAiAccess())) return;
    setState({ kind: "streaming", text: "" });
    setAttempt((value) => value + 1);
  };

  if (state.kind === "streaming" || state.kind === "ready") {
    const text = fillSituation(state.text, note);
    return (
      <div className="ai-draft">
        <p className="callout callout-small ai-draft-notice">
          <span className="ai-badge">AI</span>
          {AI_DRAFT_NOTICE}
        </p>
        {state.kind === "ready" && state.removed > 0 && (
          <p className="hint">확인할 수 없는 조건을 언급한 문단 {state.removed}개를 뺐어요.</p>
        )}
        <CopyableDraft
          key={streaming ? "streaming" : text}
          id={textareaId}
          title={aiTitle}
          initialText={streaming && !text ? "AI가 초안을 쓰고 있어요…" : text}
          copyLabel={copyLabel}
          helper={helper}
          streaming={streaming}
        />
      </div>
    );
  }

  // 접근 코드가 없거나 실패하면 지금의 고정 템플릿을 그대로 보여준다.
  const buttonLabel =
    state.kind === "no_access"
      ? "AI로 내 상황에 맞게 작성하기"
      : state.needsCode
        ? "접근 코드 다시 입력"
        : "AI로 다시 작성하기";
  return (
    <div className="ai-draft">
      {state.kind === "failed" && <p className="hint ai-draft-fallback">{state.message}</p>}
      <button type="button" className="button button-ghost button-small" onClick={startWithAccess}>
        {buttonLabel}
      </button>
      <CopyableDraft
        key={template}
        id={textareaId}
        title={title}
        initialText={template}
        copyLabel={copyLabel}
        helper={helper}
      />
    </div>
  );
}
