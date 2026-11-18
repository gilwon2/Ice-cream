import { StatusBadge } from "@/components/status-badge";
import type { EligibilityResult } from "@/lib/eligibility";
import { policies } from "@/lib/policies";

function keyReason(result: EligibilityResult) {
  const blocker =
    result.checks.find((check) => check.outcome === "fail") ??
    result.checks.find((check) => check.outcome === "unknown") ??
    result.checks.find((check) => check.outcome === "fixable");
  return blocker ? `${blocker.label}: ${blocker.detail}` : result.windowLabel;
}

export function EligibilityPanel({ results }: { results: EligibilityResult[] }) {
  return (
    <ul className="divide-y">
      {results.map((result) => {
        const policy = policies.find((item) => item.id === result.policyId);
        if (!policy) return null;
        return (
          <li key={result.policyId} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold">{policy.name}</span>
              <StatusBadge status={result.status} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{keyReason(result)}</p>
          </li>
        );
      })}
    </ul>
  );
}
