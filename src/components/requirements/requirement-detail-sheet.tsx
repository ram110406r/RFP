import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/common/risk-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfidenceMeter } from "@/components/common/confidence-meter";
import { EvidenceCard } from "@/components/common/evidence-card";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { AnswerEditor } from "./answer-editor";
import { ReviewPanel } from "./review-panel";
import { requirementQueryOptions } from "@/lib/api/requirements";
import { evidenceForIdsQueryOptions } from "@/lib/api/evidence";
import { ShieldAlert } from "lucide-react";

export function RequirementDetailSheet({
  reqId,
  open,
  onOpenChange,
}: {
  reqId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: requirement } = useSuspenseQuery(requirementQueryOptions(reqId));
  const { data: evidence } = useSuspenseQuery(evidenceForIdsQueryOptions(requirement.evidenceIds));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="space-y-2 border-b p-5 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-xs font-medium text-muted-foreground">
              {requirement.code}
            </span>
            {requirement.mandatory && (
              <Badge variant="secondary" className="font-normal">
                Mandatory
              </Badge>
            )}
            <RiskBadge risk={requirement.risk} />
            <StatusBadge status={requirement.status} />
          </div>
          <SheetTitle className="text-lg">{requirement.title}</SheetTitle>
          <SheetDescription className="text-sm text-foreground/80">
            {requirement.question}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-5">
          <AnswerEditor requirement={requirement} />

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Confidence</p>
              <ConfidenceMeter value={requirement.confidence} />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-danger/20 bg-danger-soft/40 p-4">
            <div className="flex items-center gap-2 text-danger">
              <ShieldAlert className="h-4 w-4" />
              <p className="text-sm font-medium">Risk rationale</p>
            </div>
            <p className="text-sm text-foreground/90">{requirement.riskRationale}</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Evidence ({evidence.length})</h3>
            {evidence.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3.5 text-sm text-muted-foreground">
                No evidence linked to this answer yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {evidence.map((ev) => (
                  <EvidenceCard key={ev.id} evidence={ev} />
                ))}
              </div>
            )}
          </div>

          <ReviewPanel requirement={requirement} />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Activity</h3>
            <ActivityTimeline entries={requirement.activity} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
