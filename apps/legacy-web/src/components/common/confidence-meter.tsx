import { cn } from "@/lib/utils";

/**
 * Confidence keeps its own colour mapping rather than reusing progressStage:
 * a 40%-complete RFP is simply early, but a 40%-confidence answer is a
 * problem. High confidence is good, so the ramp runs the opposite way to
 * progress and lands on the risk palette.
 */
function toneForConfidence(value: number) {
  if (value >= 0.8) return { bar: "bg-risk-low-fg", text: "text-risk-low-fg" };
  if (value >= 0.6) return { bar: "bg-risk-medium-fg", text: "text-risk-medium-fg" };
  return { bar: "bg-risk-high-fg", text: "text-risk-high-fg" };
}

export function ConfidenceMeter({
  value,
  size = "default",
  showLabel = true,
  className,
}: {
  value: number;
  size?: "sm" | "default";
  showLabel?: boolean;
  className?: string;
}) {
  const pct = Math.round(value * 100);
  const tone = toneForConfidence(value);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-full bg-progress-track",
          size === "sm" ? "h-1.5 w-16" : "h-2 w-24",
        )}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Confidence"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", tone.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn("num text-supporting font-medium", tone.text)}>{pct}%</span>
      )}
    </div>
  );
}
