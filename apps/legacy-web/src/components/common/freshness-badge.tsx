import { AlertTriangle, GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeBase, toneClasses, type Tone } from "./tone";
import type { Freshness } from "@/types";

/**
 * Same ramp logic as RiskBadge: the two states a knowledge owner has to act
 * on (stale, conflicting) carry an icon, the two that are fine do not.
 * Conflicting gets its own glyph because it is a different problem from
 * stale — the source is current, it just disagrees with another current one.
 */
const FRESHNESS_META: Record<
  Freshness,
  { label: string; tone: Tone; icon: typeof AlertTriangle | null }
> = {
  fresh: { label: "Fresh", tone: "success", icon: null },
  aging: { label: "Aging", tone: "warning", icon: null },
  stale: { label: "Stale", tone: "danger", icon: AlertTriangle },
  conflicting: { label: "Conflicting", tone: "danger", icon: GitCompareArrows },
};

export function FreshnessBadge({
  freshness,
  className,
}: {
  freshness: Freshness;
  className?: string;
}) {
  const meta = FRESHNESS_META[freshness];
  const Icon = meta.icon;
  return (
    <span className={cn(badgeBase, toneClasses[meta.tone], className)}>
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {meta.label}
    </span>
  );
}
