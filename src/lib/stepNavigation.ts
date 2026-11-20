/** 단계 번호: 0 정책 선택, 1 상황 확인, 2 해결 안내 */
export const SITUATION_STEP = 1;
export const RESULT_STEP = 2;

type ReachableInput = {
  hasPolicy: boolean;
  /** 사용자가 "다음" 버튼 등으로 실제로 도달한 가장 먼 단계 */
  furthest: number;
};

/**
 * Stepper에서 누를 수 있는 가장 먼 단계.
 * 정책을 골랐더라도 상황 확인(STEP 02)을 끝까지 거치지 않았다면
 * 해결 안내(STEP 03)로 바로 건너뛰지 못하게 실제 도달한 단계로 제한한다.
 * 상황 확인은 정책만 고르면 열린다.
 */
export function reachableStep({ hasPolicy, furthest }: ReachableInput): number {
  if (!hasPolicy) return 0;
  return Math.max(SITUATION_STEP, Math.min(RESULT_STEP, furthest));
}

/** 정책을 바꾸면 질문이 달라지므로 다시 상황 확인부터 거치게 한다(해결 안내 잠김). */
export function furthestAfterPolicyChange(furthest: number): number {
  return Math.min(furthest, SITUATION_STEP);
}
