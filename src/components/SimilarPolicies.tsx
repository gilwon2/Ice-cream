"use client";

import { useEffect, useState } from "react";
import {
  recommendationResponseSchema,
  recommendationsPath,
  type RecommendationResponse,
} from "@/lib/policyApi/recommendationsShared";
import { formatKoreanDateTime } from "@/lib/rules";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: RecommendationResponse }
  | { status: "hidden" };

/**
 * 같은 분야의 "비슷한 청년정책" 카드 목록.
 * 정책 ID 하나만 받아 스스로 불러오므로 다른 화면(예: 해결 안내 단계)으로 옮기기 쉽다.
 * 추천은 판정과 관계없고, 서버로는 정책 ID만 보낸다.
 */
export function SimilarPolicies({ policyId }: { policyId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [loadedFor, setLoadedFor] = useState(policyId);

  // 정책이 바뀌면 렌더 중에 상태를 다시 로딩으로 돌린다(effect 안에서 바로 setState하지 않기 위해).
  if (loadedFor !== policyId) {
    setLoadedFor(policyId);
    setState({ status: "loading" });
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(recommendationsPath(policyId), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = recommendationResponseSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.items.length === 0) throw new Error("invalid");
        setState({ status: "ready", data: parsed.data });
      })
      .catch(() => {
        // 추천은 부가 기능이라 실패하면 조용히 숨긴다.
        if (!controller.signal.aborted) setState({ status: "hidden" });
      });
    return () => controller.abort();
  }, [policyId]);

  if (state.status === "hidden") return null;

  return (
    <section className="section similar-policies" aria-labelledby="similar-policies-title" aria-busy={state.status === "loading"}>
      <h3 id="similar-policies-title">비슷한 청년정책</h3>
      <p className="muted">
        같은 분야의 다른 청년정책이에요. 자격과 신청 방법은 각 정책 공고에서 확인해요.
      </p>

      {state.status === "loading" ? (
        <p className="hint" role="status">
          비슷한 정책을 찾고 있어요.
        </p>
      ) : (
        <ul className="similar-list">
          {state.data.items.map((item) => (
            <li key={item.id} className="similar-card">
              <h4 className="similar-name">{item.title}</h4>
              <p className="similar-agency">
                {item.agency}
                {item.region && <span className="similar-region"> · {item.region}</span>}
              </p>
              {item.summary && <p className="similar-summary">{item.summary}</p>}
              <p className="similar-period">
                <span className="similar-label">신청기간</span> {item.period}
              </p>
              {item.url && (
                <a
                  className="source-link similar-link"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  공식 페이지 보기<span aria-hidden="true"> ↗</span>
                  <span className="sr-only">(새 탭에서 열림)</span>
                </a>
              )}
              <p className="similar-source">
                출처: {item.sourceName}
                {state.data.source === "api" &&
                  ` · 조회 시각 ${formatKoreanDateTime(state.data.fetchedAt)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
