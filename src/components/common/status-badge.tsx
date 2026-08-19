import { cn } from "@/lib/utils";
import { toneClasses, toneDotClasses, type Tone } from "./tone";
import type { RfpStatus, RequirementStatus } from "@/types";

type AnyStatus = RfpStatus | RequirementStatus | "pending" | "in_review";

const STATUS_META: Record<AnyStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  analyzing: { label: "Analyzing", tone: "info" },
  in_progress: { label: "In progress", tone: "info" },
  review: { label: "In review", tone: "warning" },
  needs_attention: { label: "Needs attention", tone: "danger" },
  submitted: { label: "Submitted", tone: "success" },
  won: { label: "Won", tone: "success" },
  lost: { label: "Lost", tone: "neutral" },
  unanswered: { label: "Unanswered", tone: "neutral" },
  drafted: { label: "Drafted", tone: "info" },
  needs_review: { label: "Needs review", tone: "warning" },
  changes_requested: { label: "Changes requested", tone: "danger" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  pending: { label: "Pending", tone: "neutral" },
  in_review: { label: "In review", tone: "warning" },
};

export function StatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none",
        toneClasses[meta.tone],
        className,
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", toneDotClasses[meta.tone])}
        aria-hidden="true"
      />
      {meta.label}
      <span className="sr-only"> status</span>
    </span>
  );
}
