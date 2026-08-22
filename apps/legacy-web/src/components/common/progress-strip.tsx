import { cn } from "@/lib/utils";
import { ProgressBar } from "./progress-bar";

export function ProgressStrip({
  progress,
  complete,
  total,
  highRisk,
  needsReview,
  className,
}: {
  progress: number;
  complete: number;
  total: number;
  highRisk: number;
  needsReview: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-panel flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3",
        className,
      )}
    >
      <ProgressBar value={progress} size="default" label="Submission readiness" />
      <span className="num text-supporting text-fg-2">
        <span className="font-semibold text-foreground">{complete}</span> / {total} answered
      </span>
      <span className="flex items-center gap-1.5 text-supporting text-fg-2">
        <span className="h-1.5 w-1.5 rounded-full bg-risk-high-fg" aria-hidden="true" />
        <span className="num font-semibold text-foreground">{highRisk}</span> high risk
      </span>
      <span className="flex items-center gap-1.5 text-supporting text-fg-2">
        <span className="h-1.5 w-1.5 rounded-full bg-risk-medium-fg" aria-hidden="true" />
        <span className="num font-semibold text-foreground">{needsReview}</span> needs review
      </span>
    </div>
  );
}
