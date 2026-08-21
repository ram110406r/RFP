import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { rfpQueryOptions } from "@/lib/api/rfps";
import { requirementQueryOptions, requirementsForRfpQueryOptions } from "@/lib/api/requirements";
import { evidenceForRequirementQueryOptions } from "@/lib/api/evidence";
import { WorkspaceBody } from "@/components/rfp/workspace-body";
import { RequirementDetailSheet } from "@/components/requirements/requirement-detail-sheet";
import { RouteErrorState } from "@/components/common/route-error-state";

export const Route = createFileRoute("/rfps/$rfpId/requirements/$reqId")({
  loader: async ({ context, params }) => {
    const requirement = await context.queryClient.ensureQueryData(
      requirementQueryOptions(params.reqId),
    );
    if (requirement.rfpId !== params.rfpId) {
      throw new Error(`Requirement "${params.reqId}" does not belong to this RFP.`);
    }
    await Promise.all([
      context.queryClient.ensureQueryData(requirementsForRfpQueryOptions(params.rfpId)),
      context.queryClient.ensureQueryData(evidenceForRequirementQueryOptions(requirement.id)),
    ]);
    return { crumb: requirement.code };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.crumb} · Tendyy` : "Requirement · Tendyy" }],
  }),
  errorComponent: RouteErrorState,
  component: RequirementDetailRoute,
});

function RequirementDetailRoute() {
  const { rfpId, reqId } = Route.useParams();
  const navigate = useNavigate();
  const { data: rfp } = useSuspenseQuery(rfpQueryOptions(rfpId));
  const { data: requirements } = useSuspenseQuery(requirementsForRfpQueryOptions(rfpId));

  return (
    <>
      <WorkspaceBody rfp={rfp} requirements={requirements} activeReqId={reqId} />
      <RequirementDetailSheet
        reqId={reqId}
        open
        onOpenChange={(open) => {
          if (!open) navigate({ to: "/rfps/$rfpId", params: { rfpId } });
        }}
      />
    </>
  );
}
