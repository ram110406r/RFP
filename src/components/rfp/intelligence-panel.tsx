import { StickySummary } from "@/components/common/sticky-summary";
import { toneDotClasses } from "@/components/common/tone";
import type { Requirement, Rfp } from "@/types";

const RISK_TONE = {
  low: "success",
  medium: "warning",
  high: "danger",
  critical: "danger",
} as const;

export function IntelligencePanel({
  rfp,
  requirements,
}: {
  rfp: Rfp;
  requirements: Requirement[];
}) {
  const categories = Array.from(new Set(requirements.map((r) => r.category)));
  const categoryStats = categories
    .map((cat) => {
      const items = requirements.filter((r) => r.category === cat);
      const done = items.filter((r) => r.status === "approved").length;
      return { cat, done, total: items.length };
    })
    .sort((a, b) => a.done / Math.max(a.total, 1) - b.done / Math.max(b.total, 1));

  const total = requirements.length || 1;

  return (
    <StickySummary>
      <div>
        <h2 className="text-sm font-semibold text-foreground">Intelligence panel</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Live snapshot of readiness across this RFP.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeDasharray={`${(rfp.readiness / 100) * 97.4} 97.4`}
              strokeLinecap="round"
            />
          </svg>
          <span className="num absolute text-sm font-semibold text-foreground">
            {rfp.readiness}%
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          <p>
            <span className="num font-medium text-foreground">{rfp.requirementsComplete}</span> /{" "}
            {rfp.requirementsTotal} requirements answered
          </p>
          <p className="mt-0.5">
            <span className="num font-medium text-foreground">{rfp.evidenceCoverage}%</span>{" "}
            evidence coverage
          </p>
          <p className="mt-0.5">
            <span className="num font-medium text-foreground">{rfp.needsReview}</span> awaiting
            review
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Risk distribution</p>
        <div className="space-y-1.5">
          {(["critical", "high", "medium", "low"] as const).map((level) => {
            const count = rfp.riskCount[level];
            return (
              <div key={level} className="flex items-center gap-2 text-xs">
                <span className={`h-1.5 w-1.5 rounded-full ${toneDotClasses[RISK_TONE[level]]}`} />
                <span className="w-14 capitalize text-muted-foreground">{level}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${toneDotClasses[RISK_TONE[level]]}`}
                    style={{ width: `${(count / total) * 100}%` }}
                  />
                </div>
                <span className="num w-4 text-right text-muted-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {categoryStats.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Weakest categories</p>
          <div className="space-y-1.5">
            {categoryStats.slice(0, 4).map(({ cat, done, total: catTotal }) => (
              <div key={cat} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate text-muted-foreground">{cat}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(done / Math.max(catTotal, 1)) * 100}%` }}
                  />
                </div>
                <span className="num w-10 text-right text-muted-foreground">
                  {done}/{catTotal}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </StickySummary>
  );
}
