import { Fragment } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { rfpQueryOptions } from "@/lib/api/rfps";
import { requirementQueryOptions } from "@/lib/api/requirements";
import { knowledgeSourceQueryOptions } from "@/lib/api/knowledge";
import { reviewQueryOptions } from "@/lib/api/reviews";

interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const segments = pathname.split("/").filter(Boolean);

  const rfpId = segments[0] === "rfps" && segments[1] !== "new" ? segments[1] : undefined;
  const reqId = segments[0] === "rfps" && segments[2] === "requirements" ? segments[3] : undefined;
  const sourceId = segments[0] === "knowledge" ? segments[1] : undefined;
  const reviewId = segments[0] === "reviews" ? segments[1] : undefined;

  // Reactive cache reads so the crumb self-corrects once each route's loader
  // resolves, instead of freezing on the raw id from a one-off cache snapshot.
  const { data: rfp } = useQuery({ ...rfpQueryOptions(rfpId ?? ""), enabled: !!rfpId });
  const { data: req } = useQuery({ ...requirementQueryOptions(reqId ?? ""), enabled: !!reqId });
  const { data: source } = useQuery({
    ...knowledgeSourceQueryOptions(sourceId ?? ""),
    enabled: !!sourceId,
  });
  const { data: review } = useQuery({
    ...reviewQueryOptions(reviewId ?? ""),
    enabled: !!reviewId,
  });

  const crumbs: Crumb[] = [{ label: "Dashboard", to: "/" }];

  if (segments[0] === "rfps") {
    crumbs.push({ label: "RFPs", to: "/rfps" });
    if (segments[1] === "new") {
      crumbs.push({ label: "New RFP" });
    } else if (segments[1]) {
      crumbs.push({ label: rfp?.title ?? segments[1], to: `/rfps/${segments[1]}` });
      if (segments[2] === "validation") {
        crumbs.push({ label: "Validation" });
      } else if (segments[2] === "submission") {
        crumbs.push({ label: "Submission" });
      } else if (segments[2] === "requirements" && segments[3]) {
        crumbs.push({ label: req?.code ?? segments[3] });
      }
    }
  } else if (segments[0] === "knowledge") {
    crumbs.push({ label: "Knowledge", to: "/knowledge" });
    if (segments[1]) {
      crumbs.push({ label: source?.name ?? segments[1] });
    }
  } else if (segments[0] === "reviews") {
    crumbs.push({ label: "Reviews", to: "/reviews" });
    if (segments[1]) {
      crumbs.push({ label: review?.requirementCode ?? segments[1] });
    }
  } else if (segments[0] === "submissions") {
    crumbs.push({ label: "Submissions" });
  } else if (segments[0] === "analytics") {
    crumbs.push({ label: "Analytics" });
  } else if (segments[0] === "settings") {
    crumbs.push({ label: "Settings" });
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && (
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                aria-hidden="true"
              />
            )}
            {crumb.to && !isLast ? (
              <Link to={crumb.to} className="truncate text-muted-foreground hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              <span
                className={
                  isLast ? "truncate font-medium text-foreground" : "truncate text-muted-foreground"
                }
                aria-current={isLast ? "page" : undefined}
              >
                {crumb.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
