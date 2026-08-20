import { FileSearch } from "lucide-react";
import { ProgressStrip } from "@/components/common/progress-strip";
import {
  RequirementTable,
  type RequirementFilterSeed,
} from "@/components/requirements/requirement-table";
import { IntelligencePanel } from "@/components/rfp/intelligence-panel";
import { EmptyState } from "@/components/common/empty-state";
import type { Requirement, Rfp } from "@/types";

export function WorkspaceBody({
  rfp,
  requirements,
  activeReqId,
  initialFilters,
}: {
  rfp: Rfp;
  requirements: Requirement[];
  activeReqId?: string | undefined;
  initialFilters?: RequirementFilterSeed | undefined;
}) {
  if (requirements.length === 0) {
    return (
      <EmptyState
        icon={<FileSearch className="h-5 w-5" />}
        title={rfp.status === "analyzing" ? "Extracting requirements…" : "No requirements yet"}
        description={
          rfp.status === "analyzing"
            ? "AI Assistant is processing the uploaded documents. This usually takes a few minutes."
            : "Upload RFP documents to extract requirements automatically."
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <ProgressStrip
        progress={rfp.progress}
        complete={rfp.requirementsComplete}
        total={rfp.requirementsTotal}
        highRisk={rfp.riskCount.high + rfp.riskCount.critical}
        needsReview={rfp.needsReview}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <RequirementTable
          key={rfp.id}
          rfpId={rfp.id}
          requirements={requirements}
          activeReqId={activeReqId}
          initialFilters={initialFilters}
        />
        <IntelligencePanel rfp={rfp} requirements={requirements} />
      </div>
    </div>
  );
}
