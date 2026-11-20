import type { RecommendationItem } from "@/lib/policyApi/recommendationsShared";
import { NATIONAL_EMPLOYMENT } from "./policies/nationalEmployment";
import type { Policy } from "./policies/types";

/**
 * 온통청년 API를 쓸 수 없을 때(키 없음, 시간 초과, 오류, 0건) 보여줄 대체 목록.
 * 새 정책 기준을 만들지 않고, 이미 검수한 정책 데이터와 공식 사이트 안내만 쓴다.
 */

const YOUTH_CENTER_URL = "https://www.youthcenter.go.kr";

function browseCard(policy: Policy): RecommendationItem {
  const field = policy.recommendation.lclsfNm;
  return {
    id: `browse-${policy.id}`,
    title: `온통청년에서 ${field} 분야 청년정책 더 찾아보기`,
    agency: "온통청년",
    summary: `온통청년 청년정책 검색에서 ${field} 분야를 고르면 지역별 정책을 볼 수 있어요.`,
    period: "정책마다 달라요",
    url: YOUTH_CENTER_URL,
    sourceName: "온통청년",
  };
}

function nationalEmploymentTypeTwo(): RecommendationItem[] {
  const alternative = NATIONAL_EMPLOYMENT.alternative;
  if (!alternative) return [];
  return [
    {
      id: "national-employment-type-2",
      title: "국민취업지원제도 II유형",
      agency: "고용노동부",
      summary: alternative.body.slice(0, 2).join(" "),
      period: "상시",
      url: alternative.link.url,
      sourceName: alternative.source.name,
    },
  ];
}

const FALLBACKS: Record<string, () => RecommendationItem[]> = {
  "national-employment": () => [...nationalEmploymentTypeTwo(), browseCard(NATIONAL_EMPLOYMENT)],
};

/** 정책별 대체 목록. 따로 정한 목록이 없으면 온통청년 찾아보기 카드 하나를 준다. */
export function fallbackRecommendations(policy: Policy): RecommendationItem[] {
  return FALLBACKS[policy.id]?.() ?? [browseCard(policy)];
}
