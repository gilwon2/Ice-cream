import { z } from "zod";
import { readAiConfig } from "@/lib/ai/config";
import { guardAiRoute } from "@/lib/ai/guard";

/** 본문 없이(빈 객체) 접근 코드만 확인한다. */
const bodySchema = z.strictObject({});

/**
 * 접근 코드 확인. AI 기능을 처음 쓸 때 화면이 이 경로로 코드를 검증한다.
 * 실제 AI 호출은 하지 않는다.
 */
export async function POST(request: Request) {
  const guard = await guardAiRoute(request, bodySchema);
  if (!guard.ok) return guard.response;
  return Response.json({ ok: true, aiAvailable: Boolean(readAiConfig().apiKey) });
}
