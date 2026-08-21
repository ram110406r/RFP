import { cn } from "@/lib/utils";
import { toneClasses, type Tone } from "./tone";
import type { Freshness } from "@/types";

const FRESHNESS_META: Record<Freshness, { label: string; tone: Tone }> = {
  fresh: { label: "Fresh", tone: "success" },
  aging: { label: "Aging", tone: "warning" },
  stale: { label: "Stale", tone: "danger" },
  conflicting: { label: "Conflicting", tone: "danger" },
};

export function FreshnessBadge({
  freshness,
  className,
}: {
  freshness: Freshness;
  className?: string;
}) {
  const meta = FRESHNESS_META[freshness];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none",
        toneClasses[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
