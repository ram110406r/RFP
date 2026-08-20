import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MetricTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("surface-panel flex flex-col gap-3 p-4", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              tone === "success" && "bg-success-soft text-success",
              tone === "warning" && "bg-warning-soft text-warning",
              tone === "danger" && "bg-danger-soft text-danger",
              tone === "neutral" && "bg-accent text-accent-foreground",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="num text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
