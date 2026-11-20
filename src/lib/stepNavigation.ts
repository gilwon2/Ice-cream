/** 단계 번호: 0 정책 선택, 1 막힌 지점, 2 상황 확인, 3 해결 안내 */
export const RESULT_STEP = 3;

type ReachableInput = {
  hasPolicy: boolean;
  hasBlocker: boolean;
  /** 사용자가 "다음" 버튼 등으로 실제로 도달한 가장 먼 단계 */
  furthest: number;
};

/**
 * Stepper에서 누를 수 있는 가장 먼 단계.
 * 정책·막힌 지점을 골랐더라도 상황 확인(STEP 03)을 끝까지 거치지 않았다면
 * 해결 안내(STEP 04)로 바로 건너뛰지 못하게 실제 도달한 단계로 제한한다.
 */
export function reachableStep({ hasPolicy, hasBlocker, furthest }: ReachableInput): number {
  const structural = !hasPolicy ? 0 : !hasBlocker ? 1 : RESULT_STEP;
  return Math.min(structural, Math.max(furthest, 0));
}

/** 정책을 바꾸면 질문이 달라지므로 다시 상황 확인부터 거치게 한다. */
export function furthestAfterPolicyChange(furthest: number): number {
  return Math.min(furthest, 2);
}
