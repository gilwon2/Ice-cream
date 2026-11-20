import { z } from "zod";

/**
 * "비슷한 청년정책" 라우트의 응답 형식. 서버와 브라우저가 함께 쓴다.
 * 추천 카드에 보여줄 값만 담고, 자격 판정에 쓸 만한 필드(연령·소득 등)는 담지 않는다.
 */

export const RECOMMENDATION_API_SOURCE = "온통청년(한국고용정보원)";

/** 화면에 보여줄 최대 카드 수 */
export const MAX_RECOMMENDATIONS = 4;

export const recommendationItemSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  /** 주관기관 */
  agency: z.string(),
  /** 지자체 정책일 때 시·도 이름 */
  region: z.string().optional(),
  /** 2줄 이내로 보여줄 요약 */
  summary: z.string(),
  /** 신청기간 표시 문구 (예: "2026.01.01 ~ 2026.12.31", "상시") */
  period: z.string(),
  /** http/https 공식 링크. 안전한 링크가 없으면 null */
  url: z.string().nullable(),
  /** 이 항목의 출처 이름 */
  sourceName: z.string().min(1),
});

export type RecommendationItem = z.infer<typeof recommendationItemSchema>;

export const recommendationResponseSchema = z.strictObject({
  /** api: 온통청년에서 받은 목록, fallback: 미리 정리한 대체 목록 */
  source: z.enum(["api", "fallback"]),
  /** 온통청년에서 조회한 시각(ISO). 대체 목록이면 응답 시각 */
  fetchedAt: z.string(),
  items: z.array(recommendationItemSchema).max(MAX_RECOMMENDATIONS),
});

export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;

/** 브라우저에서 부르는 라우트 주소. 정책 ID 말고는 아무 값도 보내지 않는다. */
export function recommendationsPath(policyId: string): string {
  return `/api/policy-recommendations?policyId=${encodeURIComponent(policyId)}`;
}
