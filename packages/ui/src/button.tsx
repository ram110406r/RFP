import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { isValidElement, cloneElement } from "react";

import { cn } from "./cn";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "outline" | "icon" | "compact";
  size?: "sm" | "md" | "lg" | "icon";
  children?: ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-[#155EEF] text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)] hover:bg-[#0F4BD6] active:bg-[#0B3EB6]",
  secondary: "border border-[#D0D5DD] bg-white text-black hover:border-[#B6C2D1] hover:bg-[#F8FAFC] active:bg-[#F2F4F7]",
  ghost: "bg-transparent text-black hover:bg-[#F8FAFC] active:bg-[#F2F4F7]",
  destructive: "bg-[#D92D20] text-white hover:bg-[#B42318] active:bg-[#912018]",
  outline: "border border-[#D0D5DD] bg-transparent text-black hover:border-[#B6C2D1] hover:bg-[#F8FAFC]",
  icon: "border border-[#D0D5DD] bg-white text-black hover:border-[#B6C2D1] hover:bg-[#F8FAFC]",
  compact: "bg-[#155EEF] text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)] hover:bg-[#0F4BD6] active:bg-[#0B3EB6]",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-[14px]",
  lg: "h-12 px-5 text-[14px]",
  icon: "h-10 w-10",
};

function baseClasses(variant: NonNullable<ButtonProps["variant"]>, size: NonNullable<ButtonProps["size"]>) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[11px] font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#155EEF]/30 active:scale-[0.99] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
    variant === "icon" ? "p-0" : null,
  );
}

export function Button({
  className,
  variant = "primary",
  size = variant === "icon" ? "icon" : variant === "compact" ? "sm" : "md",
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(baseClasses(variant, size), className);

  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement<{ className?: string }>, {
      ...props,
      className: cn((children as ReactElement<{ className?: string }>).props.className, classes),
    });
  }

  return (
    <button
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
}
