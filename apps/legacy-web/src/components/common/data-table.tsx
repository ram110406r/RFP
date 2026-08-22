import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeadlineMeta } from "@/lib/dates";
import type { RiskLevel } from "@/types";

/**
 * Table primitives shared by the RFPs, Reviews and Knowledge screens, which
 * previously each hand-rolled the same <table> markup with slightly different
 * padding.
 *
 * The point of the component is row-level triage emphasis. Density is
 * unchanged from the hand-rolled version — 44px rows, the same cell padding —
 * so no screen loses a row to this.
 */

/** Severity of a row, in precedence order. `null` renders a plain row. */
export type RowEmphasis = "critical" | "overdue" | "high" | "soon" | null;

/**
 * The stripe is an inset box-shadow painted inside the first cell, and it is
 * transparent on a normal row. Nothing about the row's box changes between
 * states, so rows never shift by a pixel as data updates — which a real
 * left-border would cause.
 *
 * Only critical rows get a background wash, at roughly 1.5%. If high-risk
 * rows were tinted too, the wash would cover a third of a typical queue and
 * stop meaning anything.
 */
const EMPHASIS_CLASSES: Record<NonNullable<RowEmphasis>, string> = {
  critical:
    "bg-row-critical-bg hover:bg-row-critical-bg-hover [&>td:first-child]:shadow-[inset_3px_0_0_var(--risk-critical-bg)]",
  overdue: "[&>td:first-child]:shadow-[inset_3px_0_0_var(--risk-high-fg)]",
  high: "[&>td:first-child]:shadow-[inset_3px_0_0_var(--risk-high-line)]",
  soon: "[&>td:first-child]:shadow-[inset_3px_0_0_var(--risk-medium-line)]",
};

/**
 * Resolves the one emphasis a row gets. A critical requirement that is also
 * overdue is still just a critical row — stacking signals would mean every
 * urgent row lights up in every column and the ranking disappears.
 */
export function rowEmphasis({
  risk,
  overdue,
  dueInDays,
}: {
  risk?: RiskLevel | null;
  overdue?: boolean;
  dueInDays?: number;
}): RowEmphasis {
  if (risk === "critical") return "critical";
  if (overdue) return "overdue";
  if (risk === "high") return "high";
  /*
   * 2 days, not 5. At 5 the stripe fired on essentially every row of a real
   * queue — a whole column of amber that ranks nothing. "Soon" has to mean
   * sooner than the rest of the table or it is not a signal.
   */
  if (typeof dueInDays === "number" && dueInDays >= 0 && dueInDays <= 2) return "soon";
  return null;
}

export function DataTable({
  head,
  children,
  className,
}: {
  head: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface-panel overflow-x-auto p-0", className)}>
      <table className="w-full text-sm">
        <thead className="bg-surface-sunken text-left">
          <tr className="border-b border-border">{head}</tr>
        </thead>
        <tbody className="divide-y divide-line-soft">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-3.5 py-2 text-label uppercase font-semibold text-muted-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-3.5 py-2.5 align-middle", className)} {...rest}>
      {children}
    </td>
  );
}

export function DataRow({
  emphasis = null,
  interactive = false,
  className,
  children,
  ...rest
}: {
  emphasis?: RowEmphasis;
  interactive?: boolean;
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition-colors",
        interactive && "cursor-pointer",
        "hover:bg-surface-sunken",
        emphasis && EMPHASIS_CLASSES[emphasis],
        emphasis === "critical" && "[&_.row-title]:font-semibold",
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

/** Primary cell text — the thing the row is "about". */
export function RowTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("row-title font-medium text-foreground", className)}>{children}</span>;
}

/** Secondary line under a RowTitle. */
export function RowSub({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("truncate text-meta text-muted-foreground", className)}>{children}</p>;
}

/**
 * Ordinary tabular data. Uses fg-2 rather than muted-foreground: a value in
 * a table is content, not a caption, and reading every cell in caption grey
 * is most of why the tables look monotone today.
 */
export function RowCell({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("num text-[12.5px] text-fg-2", className)}>{children}</span>;
}

export function DeadlineCell({ meta, className }: { meta: DeadlineMeta; className?: string }) {
  return (
    <span
      title={meta.absolute}
      className={cn(
        "num inline-flex items-center gap-1 text-[12.5px]",
        meta.urgency === "overdue" && "font-semibold text-risk-high-fg",
        meta.urgency === "soon" && "font-medium text-risk-medium-fg",
        meta.urgency === "normal" && "text-fg-2",
        className,
      )}
    >
      {meta.urgency === "overdue" && <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {meta.label}
    </span>
  );
}
