import { cn } from "@/lib/utils";

function toneForConfidence(value: number) {
  if (value >= 0.8) return { bar: "bg-success", text: "text-success" };
  if (value >= 0.6) return { bar: "bg-warning", text: "text-warning" };
  return { bar: "bg-danger", text: "text-danger" };
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
          "relative overflow-hidden rounded-full bg-muted",
          size === "sm" ? "h-1.5 w-16" : "h-2 w-24",
        )}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Confidence"
      >
        <div
          className={cn("h-full rounded-full transition-all", tone.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <span className={cn("num text-xs font-medium", tone.text)}>{pct}%</span>}
    </div>
  );
}
