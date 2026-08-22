import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChartSeries {
  label: string;
  color: string;
}

/**
 * Distinguishes two states that the old ChartCard collapsed into one
 * "No data yet":
 *
 *   empty       — there is nothing to plot *yet*, but there will be.
 *   untracked   — this metric is not recorded at all, and no amount of
 *                 waiting will populate it.
 *
 * "Avg. completion time" and "SME hours" were the second kind while claiming
 * to be the first, which quietly told users to wait for data that was never
 * coming.
 */
export type ChartState = "ready" | "loading" | "empty" | "untracked";

export function ChartCard({
  title,
  description,
  state = "ready",
  series,
  empty,
  height = 220,
  children,
  className,
}: {
  title: string;
  description: string;
  state?: ChartState;
  /** Rendered as a header legend, replacing Recharts' default. */
  series?: ChartSeries[];
  /** What to show when state is "empty" or "untracked". */
  empty?: { title: string; description: string; action?: ReactNode; icon?: ReactNode };
  height?: number;
  children?: ReactNode;
  className?: string;
}) {
  const showChart = state === "ready";

  return (
    <div className={cn("surface-panel flex flex-col gap-3 px-4 py-3.5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title text-foreground">{title}</h2>
          <p className="text-meta text-muted-foreground">{description}</p>
        </div>
        {series && series.length > 0 && showChart && (
          <ul className="flex shrink-0 flex-wrap justify-end gap-x-3 gap-y-1">
            {series.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5 text-meta text-fg-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ background: s.color }}
                  aria-hidden="true"
                />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative" style={{ height }}>
        {showChart ? (
          children
        ) : state === "loading" ? (
          <ChartSkeleton />
        ) : (
          <>
            {/*
             * The ghost grid is what stops an empty chart reading as a hole
             * in the page. The card still says "chart" even with nothing in
             * it — the cheapest available fix for the blank grey rectangle.
             */}
            <div
              className="absolute inset-x-0 top-0 bottom-4 flex flex-col justify-between opacity-60"
              aria-hidden="true"
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="block h-px bg-line-soft" />
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-sunken text-muted-foreground">
                {empty?.icon ?? <BarChart3 className="h-4 w-4" />}
              </span>
              <p className="mt-0.5 text-supporting font-semibold text-foreground">
                {empty?.title ?? (state === "untracked" ? "Not tracked yet" : "No data yet")}
              </p>
              <p className="max-w-[34ch] text-meta leading-relaxed text-muted-foreground">
                {empty?.description ??
                  "This chart will populate as more RFPs move through the pipeline."}
              </p>
              {empty?.action}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Bars roughly in the shape of the eventual chart, rather than a spinner or
 * a grey block. The shimmer is suppressed under prefers-reduced-motion by
 * the `motion-safe` variant.
 */
function ChartSkeleton() {
  const heights = [62, 44, 78, 36, 56, 70];
  return (
    <div className="absolute inset-0 flex items-end gap-2.5 px-0.5 pb-4 pt-2" aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          className="motion-safe:animate-pulse block flex-1 rounded-t bg-surface-sunken"
          style={{ height: `${h}%` }}
        />
      ))}
      <span className="sr-only">Loading chart</span>
    </div>
  );
}

/**
 * Shared Recharts styling, so every chart in the app has the same tooltip,
 * axis and grid treatment instead of each screen redeclaring them.
 */
export const chartTheme = {
  tooltip: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--popover)",
    color: "var(--popover-foreground)",
    fontSize: 12,
    padding: "6px 10px",
    boxShadow: "var(--elevation-3)",
  },
  tooltipItem: { fontSize: 12, padding: "1px 0" },
  tooltipLabel: { fontSize: 11, fontWeight: 600, marginBottom: 2 },
  axisTick: { fill: "var(--muted-foreground)", fontSize: 11 },
  grid: "var(--line-soft)",
  cursor: { fill: "var(--surface-sunken)" },
} as const;
