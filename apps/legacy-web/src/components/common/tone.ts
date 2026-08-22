export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

/**
 * Tinted-on-light badge chrome. Now points at the Interface Kit's risk ramp
 * rather than the old *-soft pastels, which sat too close in lightness to
 * read as distinct steps when scanned down a column.
 *
 * Every tone carries a border. That 1px is what keeps a tinted badge legible
 * against a tinted table row — without it, a warning badge on a critical row
 * dissolves into the background wash.
 */
export const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-fg-2 border-border",
  success: "bg-risk-low-bg text-risk-low-fg border-risk-low-line",
  warning: "bg-risk-medium-bg text-risk-medium-fg border-risk-medium-line",
  danger: "bg-risk-high-bg text-risk-high-fg border-risk-high-line",
  info: "bg-info-soft text-info border-primary/20",
};

export const toneDotClasses: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-risk-low-fg",
  warning: "bg-risk-medium-fg",
  danger: "bg-risk-high-fg",
  info: "bg-series-2",
};

/** Shared badge geometry, so every badge in the app is the same pill. */
export const badgeBase =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-meta font-semibold leading-[18px]";
