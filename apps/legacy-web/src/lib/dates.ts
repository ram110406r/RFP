/**
 * Deadline formatting for tables.
 *
 * The reference "today" is pinned rather than read from the system clock,
 * preserving the behaviour that was previously inlined in routes/index.tsx.
 * The development dataset is seeded around this date, so a live clock would
 * make every seeded deadline drift into the past and paint the whole table
 * red. Swap this for `new Date()` once the app runs on live data.
 */
const REFERENCE_TODAY = "2026-08-20";

export function daysUntil(dateStr: string, from: string = REFERENCE_TODAY): number {
  const ms = new Date(dateStr).getTime() - new Date(from).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export type DeadlineUrgency = "overdue" | "soon" | "normal";

export interface DeadlineMeta {
  /** Relative phrasing — "4d overdue", "in 2 days", "in 3 weeks". */
  label: string;
  /** The absolute date, for a `title` attribute. */
  absolute: string;
  days: number;
  urgency: DeadlineUrgency;
}

/**
 * Reviewers triage by distance, not by date. "2026-08-18" requires mental
 * arithmetic against today; "4d overdue" does not. The absolute date is
 * still returned so it can hang off a tooltip rather than being lost.
 */
export function deadlineMeta(dateStr: string, from?: string): DeadlineMeta {
  const days = daysUntil(dateStr, from);
  const abs = dateStr;

  if (days < 0) {
    const n = Math.abs(days);
    return {
      label: n === 1 ? "1d overdue" : `${n}d overdue`,
      absolute: abs,
      days,
      urgency: "overdue",
    };
  }
  if (days === 0) return { label: "due today", absolute: abs, days, urgency: "overdue" };
  if (days === 1) return { label: "in 1 day", absolute: abs, days, urgency: "soon" };
  if (days <= 5) return { label: `in ${days} days`, absolute: abs, days, urgency: "soon" };
  if (days <= 14) return { label: `in ${days} days`, absolute: abs, days, urgency: "normal" };

  const weeks = Math.round(days / 7);
  return { label: `in ${weeks} weeks`, absolute: abs, days, urgency: "normal" };
}
