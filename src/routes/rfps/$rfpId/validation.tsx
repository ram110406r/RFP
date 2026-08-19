import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertOctagon } from "lucide-react";
import { validationSnapshotQueryOptions } from "@/lib/api/validation";
import { requirementsForRfpQueryOptions } from "@/lib/api/requirements";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { cn } from "@/lib/utils";
import type {
  RequirementCategory,
  RiskLevel,
  RequirementStatus,
  ValidationCategory,
  ValidationIssue,
} from "@/types";

export const Route = createFileRoute("/rfps/$rfpId/validation")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(validationSnapshotQueryOptions(params.rfpId)),
  pendingComponent: PageSkeleton,
  component: Validation,
});

const TONE_BAR: Record<ValidationCategory["tone"], string> = {
  neutral: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const SEVERITY_TONE: Record<ValidationIssue["severity"], string> = {
  critical: "border-danger/30 bg-danger-soft/40",
  high: "border-danger/20 bg-danger-soft/20",
  medium: "border-warning/20 bg-warning-soft/20",
  low: "border-border bg-muted/20",
};

interface WorkspaceSearch {
  category?: RequirementCategory;
  risk?: RiskLevel;
  status?: RequirementStatus;
  mandatoryOnly?: boolean;
  hasEvidence?: boolean;
}

function categorySearch(id: string, requirements: { risk: RiskLevel }[]): WorkspaceSearch {
  switch (id) {
    case "mandatory":
      return { mandatoryOnly: true };
    case "risk":
      return { risk: requirements.some((r) => r.risk === "critical") ? "critical" : "high" };
    case "evidence":
      return { hasEvidence: false };
    case "reviews":
      return { status: "needs_review" };
    case "legal":
      return { category: "Legal" };
    case "commercial":
      return { category: "Commercial" };
    default:
      return {};
  }
}

function Validation() {
  const { rfpId } = Route.useParams();
  const { data: snapshot } = useSuspenseQuery(validationSnapshotQueryOptions(rfpId));
  const { data: requirements } = useSuspenseQuery(requirementsForRfpQueryOptions(rfpId));

  const grouped = (["critical", "high", "medium", "low"] as const).map((severity) => ({
    severity,
    issues: snapshot.issues.filter((i) => i.severity === severity),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-6 rounded-xl border bg-card p-5 sm:flex-row sm:items-center">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={
                snapshot.score >= 80
                  ? "var(--success)"
                  : snapshot.score >= 50
                    ? "var(--warning)"
                    : "var(--danger)"
              }
              strokeWidth="3"
              strokeDasharray={`${(snapshot.score / 100) * 97.4} 97.4`}
              strokeLinecap="round"
            />
          </svg>
          <span className="num absolute text-xl font-semibold text-foreground">
            {snapshot.score}%
          </span>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Submission readiness</h1>
          <p className="text-sm text-muted-foreground">
            {snapshot.score >= 80
              ? "Nearly ready — resolve remaining issues below before generating the package."
              : "Not yet ready for submission. Work through the categories and issues below."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {snapshot.categories.map((cat) => (
          <Link
            key={cat.id}
            to="/rfps/$rfpId"
            params={{ rfpId }}
            search={categorySearch(cat.id, requirements)}
            className="surface-panel space-y-2 p-4 transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{cat.label}</p>
              <span className="num text-sm text-muted-foreground">
                {cat.value}
                {cat.total !== null ? ` / ${cat.total}` : ""}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", TONE_BAR[cat.tone])}
                style={{
                  width: `${cat.total ? (cat.value / Math.max(cat.total, 1)) * 100 : 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{cat.hint}</p>
          </Link>
        ))}
      </div>

      <div className="space-y-5">
        <h2 className="text-sm font-semibold text-foreground">Issues</h2>
        {snapshot.issues.length === 0 ? (
          <EmptyState
            title="No outstanding issues"
            description="This RFP has no flagged validation issues."
          />
        ) : (
          grouped.map(
            ({ severity, issues }) =>
              issues.length > 0 && (
                <div key={severity} className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <AlertOctagon className="h-3.5 w-3.5" /> {severity} ({issues.length})
                  </p>
                  <div className="space-y-2">
                    {issues.map((issue) => {
                      const req = requirements.find((r) => r.code === issue.requirementCode);
                      return (
                        <div
                          key={issue.id}
                          className={cn("rounded-lg border p-3.5", SEVERITY_TONE[issue.severity])}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {req ? (
                              <Link
                                to="/rfps/$rfpId/requirements/$reqId"
                                params={{ rfpId, reqId: req.id }}
                                className="num text-xs font-semibold text-primary hover:underline"
                              >
                                {issue.requirementCode}
                              </Link>
                            ) : (
                              <span className="num text-xs font-semibold text-muted-foreground">
                                {issue.requirementCode}
                              </span>
                            )}
                            <p className="text-sm font-medium text-foreground">{issue.issue}</p>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{issue.reason}</p>
                          <p className="mt-1.5 text-xs font-medium text-foreground">
                            <span className="text-muted-foreground">Recommended: </span>
                            {issue.action}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ),
          )
        )}
      </div>
    </div>
  );
}
