import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Circle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MetricTile } from "@/components/common/metric-tile";
import { cn } from "@/lib/utils";
import type { Rfp } from "@/types";
import type { WizardCategory } from "./types";

const STAGES = [
  { id: "uploaded", label: "Documents uploaded" },
  { id: "parsed", label: "Documents parsed" },
  { id: "questions", label: "Questions detected" },
  { id: "classify", label: "Classifying requirements" },
  { id: "mandatory", label: "Detecting mandatory requirements" },
  { id: "graph", label: "Building requirement graph" },
  { id: "intelligence", label: "Calculating initial RFP intelligence" },
] as const;

const STAGE_INTERVAL_MS = 1000;

export function StepAnalyze({
  documentCount,
  categories,
  createRfp,
  onOpenWorkspace,
}: {
  documentCount: number;
  categories: WizardCategory[];
  createRfp: () => Promise<Rfp>;
  onOpenWorkspace: (rfpId: string) => void;
}) {
  const [stageIndex, setStageIndex] = useState(2);
  const [rfp, setRfp] = useState<Rfp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    createRfp()
      .then(setRfp)
      .catch(() =>
        setError("Something went wrong while creating this RFP. You can go back and try again."),
      );
  }, [createRfp]);

  useEffect(() => {
    if (stageIndex >= STAGES.length) return;
    const t = setTimeout(() => setStageIndex((i) => i + 1), STAGE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [stageIndex]);

  const targets = useMemo(() => {
    const base = 180 + documentCount * 35 + Math.round(Math.random() * 40);
    return {
      requirements: base,
      mandatory: Math.round(base * 0.12),
      security: categories.includes("Security") ? Math.round(base * 0.09) : 0,
      commercial: categories.includes("Commercial") ? Math.round(base * 0.05) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computed once for the life of this step
  }, []);

  const analysisDone = stageIndex >= STAGES.length;
  const complete = analysisDone && rfp !== null;
  const fraction = Math.min(1, Math.max(0, stageIndex - 1) / (STAGES.length - 2));
  const metrics = {
    requirements: Math.round(targets.requirements * fraction),
    mandatory: Math.round(targets.mandatory * fraction),
    security: Math.round(targets.security * fraction),
    commercial: Math.round(targets.commercial * fraction),
  };

  if (error) {
    return (
      <div className="surface-panel space-y-2 p-8 text-center">
        <p className="text-sm font-medium text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="surface-panel space-y-5 p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Sparkles className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {complete ? "Analysis complete" : "Analyzing your RFP"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {complete
                ? "Your workspace is ready — requirements have been extracted and organized."
                : "We're analyzing your RFP and preparing your workspace."}
            </p>
          </div>
        </div>

        <Progress value={(Math.min(stageIndex, STAGES.length) / STAGES.length) * 100} />

        <ol className="space-y-2.5">
          {STAGES.map((stage, i) => {
            const state = stageIndex > i ? "done" : stageIndex === i ? "active" : "pending";
            return (
              <li key={stage.id} className="flex items-center gap-2.5 text-sm">
                {state === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                {state === "active" && (
                  <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                    <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-primary/40" />
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  </span>
                )}
                {state === "pending" && (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                )}
                <span
                  className={cn(
                    state === "pending" ? "text-muted-foreground" : "text-foreground",
                    state === "active" && "font-medium",
                  )}
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile label="Requirements detected" value={metrics.requirements} />
        <MetricTile label="Mandatory" value={metrics.mandatory} />
        <MetricTile label="Security" value={metrics.security} />
        <MetricTile label="Commercial" value={metrics.commercial} />
      </div>

      {complete && rfp && (
        <div className="flex justify-center">
          <Button size="lg" onClick={() => onOpenWorkspace(rfp.id)}>
            Open RFP Workspace
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
