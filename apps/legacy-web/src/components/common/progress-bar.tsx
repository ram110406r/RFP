import { cn } from "@/lib/utils";

type Size = "sm" | "default" | "lg";

const TRACK_SIZE: Record<Size, string> = {
  sm: "h-1.5 w-16",
  default: "h-1.5 w-21",
  lg: "h-2 w-full",
};

/**
 * Fill colour is keyed to the stage of completion, not to a single flat
 * brand blue. Scanning a Progress column, the pale early bars separate from
 * the near-done ones without reading a single percentage.
 *
 * Green appears at 100 and nowhere else, so it never competes with the risk
 * ramp's green — a green bar means "finished", never "low risk".
 */
export function progressStage(pct: number) {
  if (pct >= 100) return { fill: "bg-progress-done", text: "text-progress-done" };
  if (pct >= 80) return { fill: "bg-progress-high", text: "text-foreground" };
  if (pct >= 40) return { fill: "bg-progress-mid", text: "text-foreground" };
  return { fill: "bg-progress-early", text: "text-foreground" };
}

export function ProgressBar({
  value,
  size = "default",
  showLabel = true,
  label = "Progress",
  className,
}: {
  /** 0–100. */
  value: number;
  size?: Size;
  showLabel?: boolean;
  label?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const stage = progressStage(pct);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-full bg-progress-track",
          TRACK_SIZE[size],
        )}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", stage.fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn("num text-supporting font-medium", stage.text)}>{pct}%</span>
      )}
    </div>
  );
}
