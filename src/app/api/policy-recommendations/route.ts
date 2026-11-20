import { z } from "zod";
import { POLICIES } from "@/data/policies";
import { getRecommendations } from "@/lib/policyApi/youthPolicy";

const querySchema = z.strictObject({
  policyId: z.string().refine((id) => POLICIES.some((policy) => policy.id === id)),
});

/**
 * 진단 중인 정책과 같은 분야의 "비슷한 청년정책"을 돌려준다.
 * 브라우저는 정책 ID만 보내고, 다른 쿼리 값은 읽지 않는다(사용자 입력값이 온통청년으로 가지 않게).
 * 온통청년 호출이 실패해도 200과 대체 목록(source: "fallback")을 준다.
 */
export async function GET(request: Request) {
  const policyId = new URL(request.url).searchParams.get("policyId");
  const parsed = querySchema.safeParse({ policyId });
  if (!parsed.success) {
    return Response.json({ error: "알 수 없는 정책이에요." }, { status: 400 });
  }
  const policy = POLICIES.find((item) => item.id === parsed.data.policyId);
  if (!policy) {
    return Response.json({ error: "알 수 없는 정책이에요." }, { status: 400 });
  }
  const body = await getRecommendations(policy);
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
