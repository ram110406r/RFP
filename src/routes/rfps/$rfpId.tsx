import { createFileRoute, Link, Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, MoreHorizontal } from "lucide-react";
import { rfpQueryOptions } from "@/lib/api/rfps";
import { StatusBadge } from "@/components/common/status-badge";
import { PersonAvatar } from "@/components/common/person-avatar";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { RouteErrorState } from "@/components/common/route-error-state";
import { Button } from "@/components/ui/button";
import { getPerson } from "@/data/people";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rfps/$rfpId")({
  loader: async ({ context, params }) => {
    const rfp = await context.queryClient.ensureQueryData(rfpQueryOptions(params.rfpId));
    return { crumb: rfp.title };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.crumb} · RFP OS` : "RFP · RFP OS" }],
  }),
  pendingComponent: PageSkeleton,
  errorComponent: RouteErrorState,
  component: RfpShell,
});

const TABS = [
  { to: "/rfps/$rfpId", label: "Workspace", exact: true },
  { to: "/rfps/$rfpId/validation", label: "Validation" },
  { to: "/rfps/$rfpId/submission", label: "Submission" },
];

function RfpShell() {
  const { rfpId } = useParams({ from: "/rfps/$rfpId" });
  const { data: rfp } = useSuspenseQuery(rfpQueryOptions(rfpId));
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{rfp.title}</h1>
            <StatusBadge status={rfp.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {rfp.customer} · {rfp.opportunity}
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
            <span className="num">Deadline {rfp.deadline}</span>
            <span className="flex items-center gap-1.5">
              Owner <PersonAvatar personId={rfp.ownerId} /> {getPerson(rfp.ownerId)?.name}
            </span>
            <span className="num">${(rfp.estimatedValue / 1000).toFixed(0)}k estimated value</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/rfps/$rfpId/validation" params={{ rfpId }}>
              Review
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/rfps/$rfpId/submission" params={{ rfpId }}>
              <Download className="h-3.5 w-3.5" /> Export
            </Link>
          </Button>
          <Button size="icon" variant="ghost" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="flex items-center gap-1 border-b" aria-label="RFP sections">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === `/rfps/${rfpId}`
            : pathname.startsWith(tab.to.replace("$rfpId", rfpId));
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ rfpId }}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
