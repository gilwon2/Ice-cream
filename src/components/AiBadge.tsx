type AiBadgeProps = {
  /** inverse: 파란 주 버튼 위처럼 어두운 바탕에 올릴 때 */
  variant?: "default" | "inverse";
};

/** AI가 관여하는 버튼·결과에 붙이는 공통 표시 */
export function AiBadge({ variant = "default" }: AiBadgeProps) {
  return <span className={`ai-badge${variant === "inverse" ? " ai-badge-inverse" : ""}`}>AI</span>;
}
