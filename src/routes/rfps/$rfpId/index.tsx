import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { rfpQueryOptions } from "@/lib/api/rfps";
import { requirementsForRfpQueryOptions } from "@/lib/api/requirements";
import { WorkspaceBody } from "@/components/rfp/workspace-body";
import { PageSkeleton } from "@/components/common/page-skeleton";

const searchSchema = z.object({
  categories: z
    .array(
      z.enum([
        "Security",
        "Commercial",
        "Compliance",
        "Product",
        "Legal",
        "Architecture",
        "Support",
      ]),
    )
    .optional(),
  risks: z.array(z.enum(["low", "medium", "high", "critical"])).optional(),
  statuses: z
    .array(
      z.enum([
        "unanswered",
        "drafted",
        "needs_review",
        "changes_requested",
        "approved",
        "rejected",
      ]),
    )
    .optional(),
  ownerTeams: z.array(z.string()).optional(),
  mandatoryOnly: z.boolean().optional(),
  missingEvidence: z.boolean().optional(),
  mine: z.boolean().optional(),
});

export const Route = createFileRoute("/rfps/$rfpId/")({
  validateSearch: searchSchema,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(requirementsForRfpQueryOptions(params.rfpId)),
  pendingComponent: PageSkeleton,
  component: Workspace,
});

function Workspace() {
  const { rfpId } = Route.useParams();
  const search = Route.useSearch();
  const { data: rfp } = useSuspenseQuery(rfpQueryOptions(rfpId));
  const { data: requirements } = useSuspenseQuery(requirementsForRfpQueryOptions(rfpId));

  return <WorkspaceBody rfp={rfp} requirements={requirements} initialFilters={search} />;
}
