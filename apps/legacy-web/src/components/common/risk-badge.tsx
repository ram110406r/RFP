import { cn } from "@/lib/utils";
import { toneClasses, type Tone } from "./tone";
import type { RiskLevel } from "@/types";

const RISK_META: Record<RiskLevel, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "success" },
  medium: { label: "Medium", tone: "warning" },
  high: { label: "High", tone: "danger" },
  critical: { label: "Critical", tone: "danger" },
};

export function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
  const meta = RISK_META[risk];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none",
        toneClasses[meta.tone],
        risk === "critical" && "ring-1 ring-danger/40",
        className,
      )}
    >
      {meta.label}
      <span className="sr-only"> risk</span>
    </span>
  );
}
