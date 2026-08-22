import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="text-display text-balance text-foreground">{title}</h1>
        {description && <p className="text-supporting text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
