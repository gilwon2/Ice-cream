import { draftEventsToResponse, streamDraft } from "@/lib/ai/drafts";
import { draftRequestSchema } from "@/lib/ai/draftsShared";
import { guardAiRoute } from "@/lib/ai/guard";

/** 스트림 전체 시간(55초)보다 넉넉하게 둔다. */
export const maxDuration = 60;

/**
 * 문의문·제안문 초안을 스트리밍(NDJSON)으로 만든다.
 * 보호(호출 제한 → 접근 코드 → 본문 검증)를 통과하지 못하면 429/401/400,
 * AI가 실패하면 200 스트림의 마지막 error 이벤트로 알리고 화면은 고정 템플릿을 보여준다.
 */
export async function POST(request: Request) {
  const guard = await guardAiRoute(request, draftRequestSchema);
  if (!guard.ok) return guard.response;
  return draftEventsToResponse(streamDraft(guard.body));
}
