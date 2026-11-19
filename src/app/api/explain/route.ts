import { explainRule } from "@/lib/ai/explain";
import { explainRequestSchema } from "@/lib/ai/explainShared";
import { guardAiRoute } from "@/lib/ai/guard";

/**
 * 조건 하나를 사용자 상황에 맞춰 설명한다.
 * 보호(호출 제한 → 접근 코드 → 본문 검증)를 통과하지 못하면 429/401/400,
 * AI가 실패하면 200과 { ok: false }를 돌려주고 화면은 기본 설명을 보여준다.
 */
export async function POST(request: Request) {
  const guard = await guardAiRoute(request, explainRequestSchema);
  if (!guard.ok) return guard.response;
  return Response.json(await explainRule(guard.body));
}
