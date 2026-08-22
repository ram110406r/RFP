import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type MetricTone = "neutral" | "success" | "warning" | "danger";

const TONE_DOT: Record<MetricTone, string> = {
  neutral: "",
  success: "bg-risk-low-fg",
  warning: "bg-risk-medium-fg",
  danger: "bg-risk-high-fg",
};

const TONE_VALUE: Record<MetricTone, string> = {
  neutral: "text-foreground",
  success: "text-risk-low-fg",
  warning: "text-risk-medium-fg",
  danger: "text-risk-high-fg",
};

/**
 * The dashboard stat card — the most-looked-at object in the product.
 *
 * Three deliberate subtractions and additions versus the old tile:
 *
 *  - The label drops from 14px body grey to the 11px uppercase label. This
 *    single change is what makes the number read as the subject of the card
 *    rather than a value sitting beside a caption.
 *
 *  - The icon chip is gone. A tinted 32px square repeated across five tiles
 *    cost vertical space and communicated nothing that the label did not.
 *    Tone now lands on the number itself: `47` in red states the alert far
 *    more directly than a red box next to a neutral `47`.
 *
 *  - A delta chip occupies the space the icon vacated. `direction` says which
 *    way is good for THIS metric, because up is good for win rate and bad for
 *    overdue reviews.
 */
export function MetricTile({
  label,
  value,
  unit,
  hint,
  tone = "neutral",
  delta,
  direction = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  /** Rendered smaller and muted, baseline-aligned with the value. */
  unit?: string | undefined;
  hint?: ReactNode;
  tone?: MetricTone;
  /** Period-over-period movement, as a percentage. Omit when not tracked. */
  delta?: number;
  /** Which direction counts as good for this metric. */
  direction?: "up" | "down" | "neutral";
  className?: string;
}) {
  const hasDelta = typeof delta === "number" && delta !== 0;
  const rising = (delta ?? 0) > 0;
  const isGood = direction === "neutral" ? null : direction === "up" ? rising : !rising;

  return (
    <div className={cn("surface-panel flex flex-col gap-1.5 px-4 py-3.5", className)}>
      <div className="flex items-center gap-1.5">
        {tone !== "neutral" && (
          <span
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[tone])}
            aria-hidden="true"
          />
        )}
        <span className="text-label uppercase text-muted-foreground">{label}</span>
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        {/* Value and unit are one typographic word — "24%", not "24 %" — so
            they get their own tight group and the gap-2 applies only before
            the delta chip. */}
        <span className={cn("flex items-baseline", unit === "%" ? "gap-0" : "gap-1")}>
          <span className={cn("num text-metric", TONE_VALUE[tone])}>{value}</span>
          {unit && <span className="text-title font-medium text-muted-foreground">{unit}</span>}
        </span>
        {hasDelta && (
          <span
            className={cn(
              "num inline-flex items-center gap-0.5 rounded-full py-0.5 pl-1 pr-1.5 text-meta font-semibold",
              isGood === null
                ? "bg-surface-sunken text-muted-foreground"
                : isGood
                  ? "bg-risk-low-bg text-risk-low-fg"
                  : "bg-risk-high-bg text-risk-high-fg",
            )}
          >
            {rising ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>

      {hint && <span className="text-supporting text-fg-2">{hint}</span>}
    </div>
  );
}
