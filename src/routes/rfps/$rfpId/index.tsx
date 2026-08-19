import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { rfpQueryOptions } from "@/lib/api/rfps";
import { requirementsForRfpQueryOptions } from "@/lib/api/requirements";
import { WorkspaceBody } from "@/components/rfp/workspace-body";
import { PageSkeleton } from "@/components/common/page-skeleton";

const searchSchema = z.object({
  category: z
    .enum(["Security", "Commercial", "Compliance", "Product", "Legal", "Architecture", "Support"])
    .optional(),
  risk: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z
    .enum(["unanswered", "drafted", "needs_review", "changes_requested", "approved", "rejected"])
    .optional(),
  mandatoryOnly: z.boolean().optional(),
  hasEvidence: z.boolean().optional(),
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
