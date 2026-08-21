import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, Download, FileText, Sparkles } from "lucide-react";
import { submissionVersionsQueryOptions, generateSubmissionPackage } from "@/lib/api/submission";
import { validationSnapshotQueryOptions } from "@/lib/api/validation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { CURRENT_USER_ID, personName } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rfps/$rfpId/submission")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(submissionVersionsQueryOptions(params.rfpId)),
      context.queryClient.ensureQueryData(validationSnapshotQueryOptions(params.rfpId)),
    ]),
  pendingComponent: PageSkeleton,
  component: Submission,
});

function Submission() {
  const { rfpId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: versions } = useSuspenseQuery(submissionVersionsQueryOptions(rfpId));
  const { data: validation } = useSuspenseQuery(validationSnapshotQueryOptions(rfpId));
  const [selectedId, setSelectedId] = useState(versions[0]?.id);
  const [previewOpen, setPreviewOpen] = useState(false);

  const generateMutation = useMutation({
    mutationFn: () => generateSubmissionPackage(rfpId, personName(CURRENT_USER_ID)),
    onSuccess: (version) => {
      queryClient.invalidateQueries({ queryKey: ["submission", rfpId] });
      setSelectedId(version.id);
      toast.success("Submission package generated", { description: version.label });
    },
    onError: () => toast.error("Couldn't generate the submission package. Try again."),
  });

  const version = versions.find((v) => v.id === selectedId) ?? versions[0];

  if (!version) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title={
          generateMutation.isPending
            ? "Generating submission package…"
            : "No submission package yet"
        }
        description="Generate a package once mandatory requirements and high-risk items are resolved."
        action={
          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <Sparkles className="h-4 w-4" /> Generate submission package
          </Button>
        }
      />
    );
  }

  const checklistDone = version.checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Select value={selectedId ?? version.id} onValueChange={setSelectedId}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            by {version.createdBy} · {new Date(version.createdAt).toLocaleDateString("en-US")}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            Preview
          </Button>
          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <Sparkles className="h-4 w-4" />{" "}
            {generateMutation.isPending ? "Generating…" : "Generate submission package"}
          </Button>
        </div>
      </div>

      {version.note && <p className="text-sm text-muted-foreground">{version.note}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Checklist</h2>
            <span className="num text-xs text-muted-foreground">
              {checklistDone}/{version.checklist.length}
            </span>
          </div>
          <div className="surface-panel divide-y p-0">
            {version.checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5 px-4 py-3">
                {item.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={cn("text-sm", item.done ? "text-foreground" : "text-muted-foreground")}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Readiness score: {validation.score}%. Resolve outstanding issues on the Validation tab.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Generated artifacts</h2>
          <div className="surface-panel divide-y p-0">
            {version.artifacts.map((artifact) => (
              <div key={artifact.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{artifact.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{artifact.description}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium",
                    artifact.ready ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {artifact.ready ? "Ready" : "Pending"}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={!artifact.ready}
                  aria-label={`Download ${artifact.label}`}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{version.label} preview</DialogTitle>
            <DialogDescription>
              A rendered preview of the submission package artifacts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {version.artifacts.map((artifact) => (
              <div key={artifact.id} className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-foreground">{artifact.label}</p>
                <p className="text-xs text-muted-foreground">{artifact.description}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
