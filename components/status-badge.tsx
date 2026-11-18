import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/diagnosis-prompt";
import type { PolicyStatus } from "@/lib/eligibility";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<PolicyStatus, string> = {
  eligible: "bg-good-soft text-good",
  fixable: "bg-warn-soft text-warn",
  needs_check: "bg-warn-soft text-warn",
  not_open: "bg-info-soft text-info",
  already_receiving: "bg-info-soft text-info",
  ineligible: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: PolicyStatus }) {
  return (
    <Badge variant="secondary" className={cn("shrink-0 font-semibold", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
