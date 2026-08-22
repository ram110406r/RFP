import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeBase } from "./tone";
import type { RiskLevel } from "@/types";

/**
 * Four genuinely distinct steps. Previously "high" and "critical" both
 * resolved to the danger tone and were separated only by a 40%-opacity ring,
 * which is invisible when you are scanning forty rows for the one that will
 * lose the deal.
 *
 * Two devices carry the top of the ramp:
 *   - Critical is the ONLY inverted badge in the app. Everything else is
 *     tinted-on-light, so the single solid fill reads instantly.
 *   - High and Critical get a triangle; Low and Medium stay wordmark-only.
 *     Putting an icon on all four would flatten the ramp again.
 */
const RISK_META: Record<RiskLevel, { label: string; className: string; icon: boolean }> = {
  low: {
    label: "Low",
    className: "border-risk-low-line bg-risk-low-bg text-risk-low-fg",
    icon: false,
  },
  medium: {
    label: "Medium",
    className: "border-risk-medium-line bg-risk-medium-bg text-risk-medium-fg",
    icon: false,
  },
  high: {
    label: "High",
    className: "border-risk-high-line bg-risk-high-bg text-risk-high-fg",
    icon: true,
  },
  critical: {
    label: "Critical",
    className: "border-risk-critical-line bg-risk-critical-bg text-risk-critical-fg",
    icon: true,
  },
};

export function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
  const meta = RISK_META[risk];
  return (
    <span className={cn(badgeBase, meta.className, className)}>
      {meta.icon && (
        <AlertTriangle
          className={cn("h-3 w-3 shrink-0", risk === "critical" && "fill-current")}
          aria-hidden="true"
        />
      )}
      {meta.label}
      <span className="sr-only"> risk</span>
    </span>
  );
}
