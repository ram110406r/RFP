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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* min-w-0 / minmax(0,1fr): a grid item defaults to min-width:auto, so
            the wide requirements table grew its own track instead of scrolling
            inside it, pushing the intelligence panel off the right edge. */}
        <div className="min-w-0">
          <RequirementTable
            key={rfp.id}
            rfpId={rfp.id}
            requirements={requirements}
            activeReqId={activeReqId}
            initialFilters={initialFilters}
          />
        </div>
        <IntelligencePanel rfp={rfp} requirements={requirements} />
      </div>
    </div>
  );
}
