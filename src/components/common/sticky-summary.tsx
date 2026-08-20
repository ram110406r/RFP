import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StickySummary({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("lg:sticky lg:top-20 lg:self-start", className)}>
      <div className="surface-panel space-y-5 p-5">{children}</div>
    </div>
  );
}
