import { cn } from "@/lib/utils";

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
        "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <div className="relative h-2 w-32 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="num text-sm font-semibold text-foreground">{progress}%</span>
      </div>
      <span className="num text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{complete}</span> / {total} answered
      </span>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
        <span className="num font-medium text-foreground">{highRisk}</span> high risk
      </span>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
        <span className="num font-medium text-foreground">{needsReview}</span> needs review
      </span>
    </div>
  );
}
