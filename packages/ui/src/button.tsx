import type { ButtonHTMLAttributes } from "react";

import { cn } from "./cn";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-[6px] px-3.5 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-slate-900 text-white hover:bg-slate-700",
        variant === "secondary" && "bg-slate-100 text-slate-900 hover:bg-slate-200",
        variant === "ghost" && "hover:bg-slate-100",
        className,
      )}
      {...props}
    />
  );
}
