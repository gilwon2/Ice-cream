import { sendAi, type AiAccessStore } from "./access";
import {
  DRAFTS_PATH,
  draftCacheKey,
  type DraftRequest,
  type DraftStreamEvent,
} from "./draftsShared";
import type { ExplanationCache } from "./explainClient";

/** 브라우저에서 초안 스트림을 읽는다. 성공한 초안만 sessionStorage에 저장한다. */

export type DraftResult =
  | { kind: "ready"; text: string; cached: boolean; removed: number }
  | { kind: "no_access" }
  | { kind: "failed"; message: string; needsCode: boolean };

const STREAM_BROKEN = "AI 초안을 끝까지 받지 못해 기본 문안을 보여드릴게요.";

function parseEvent(line: string): DraftStreamEvent | null {
  try {
    const value = JSON.parse(line) as DraftStreamEvent;
    return value && typeof value === "object" && "type" in value ? value : null;
  } catch {
    return null;
  }
}

/**
 * 초안을 요청하고 문단이 올 때마다 onText로 지금까지의 글을 알려준다.
 * 같은 요청이면 저장된 초안을 쓰고 서버를 부르지 않는다. 예외를 던지지 않는다.
 */
export async function requestDraft(
  request: DraftRequest,
  {
    store,
    cache,
    onText,
    signal,
    fetchImpl = fetch,
  }: {
    store: AiAccessStore;
    cache: ExplanationCache;
    onText?: (text: string) => void;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
  },
): Promise<DraftResult> {
  const key = draftCacheKey(request);
  const cached = cache.get(key);
  if (cached) return { kind: "ready", text: cached, cached: true, removed: 0 };
  if (!store.hasConsent() || !store.getAccessCode()) return { kind: "no_access" };

  const sent = await sendAi(DRAFTS_PATH, request, { store, fetchImpl, signal });
  if (!sent.ok) {
    return { kind: "failed", message: sent.message, needsCode: sent.reason === "invalid_access_code" };
  }
  const body = sent.data.body;
  if (!body) return { kind: "failed", message: STREAM_BROKEN, needsCode: false };

  const paragraphs: string[] = [];
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";

  const handle = (line: string): DraftResult | null => {
    if (!line.trim()) return null;
    const event = parseEvent(line);
    if (!event) return { kind: "failed", message: STREAM_BROKEN, needsCode: false };
    if (event.type === "text") {
      paragraphs.push(event.text);
      onText?.(paragraphs.join("\n\n"));
      return null;
    }
    if (event.type === "error") return { kind: "failed", message: event.message, needsCode: false };
    const text = paragraphs.join("\n\n");
    cache.set(key, text);
    return { kind: "ready", text, cached: false, removed: event.removed };
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) pending += value;
      const lines = pending.split("\n");
      pending = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const result = handle(line);
        if (result) return result;
      }
      if (done) break;
    }
  } catch {
    // 연결이 끊기거나 취소되면 아래에서 실패로 돌려준다.
  } finally {
    reader.cancel().catch(() => {});
  }
  // done 이벤트 없이 끝난 스트림은 쓰지 않는다.
  return { kind: "failed", message: STREAM_BROKEN, needsCode: false };
}
