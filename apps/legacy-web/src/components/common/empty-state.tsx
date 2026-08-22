import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One empty-state pattern for the whole app: glyph, short label, one line of
 * explanation, optional next action.
 *
 * `size="inline"` is for empty states that sit inside an existing panel (the
 * dashboard's "My tasks" list), where the dashed border and full padding of
 * the standalone version would draw a box inside a box.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "default",
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: "default" | "inline";
  className?: string;
}) {
  const inline = size === "inline";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        inline
          ? "px-4 py-8"
          : "rounded-xl border border-dashed border-border bg-card/40 px-6 py-12",
        className,
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex items-center justify-center rounded-full border border-border bg-surface-sunken text-muted-foreground",
            inline ? "h-8 w-8" : "h-11 w-11",
          )}
        >
          {icon}
        </span>
      )}
      <div className="space-y-0.5">
        <p className="text-supporting font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-meta leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
