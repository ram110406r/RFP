import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS, type WizardStepId } from "./types";

export function WizardStepper({ current }: { current: WizardStepId }) {
  const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === current);

  return (
    <ol className="flex items-center" aria-label="RFP creation steps">
      {WIZARD_STEPS.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "upcoming";
        const isLast = i === WIZARD_STEPS.length - 1;
        return (
          <li key={step.id} className={cn("flex items-center", !isLast && "flex-1")}>
            <div className="flex shrink-0 items-center gap-2">
              <div
                className={cn(
                  "num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "active" && "border-primary text-primary",
                  state === "upcoming" && "border-border text-muted-foreground",
                )}
                aria-current={state === "active" ? "step" : undefined}
              >
                {state === "done" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  String(step.index).padStart(2, "0")
                )}
              </div>
              <span
                className={cn(
                  "hidden text-sm font-medium sm:inline",
                  state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "mx-2 h-px flex-1 transition-colors sm:mx-3",
                  state === "done" ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
