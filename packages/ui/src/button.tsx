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
  primary: "border border-[var(--primary)] bg-[var(--primary)] text-white hover:border-[var(--primary-hover)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)]",
  secondary: "border border-[var(--border-strong)] bg-white text-[var(--text)] hover:bg-[var(--surface-muted)] active:bg-[var(--neutral-soft)]",
  ghost: "bg-transparent text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] active:bg-[var(--neutral-soft)]",
  destructive: "border border-[var(--danger)] bg-[var(--danger)] text-white hover:bg-[var(--danger-strong)] active:bg-[var(--danger-strong)]",
  outline: "border border-[var(--border-strong)] bg-transparent text-[var(--text)] hover:bg-[var(--surface-muted)]",
  icon: "border border-[var(--border)] bg-white text-[var(--text-soft)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]",
  compact: "border border-[var(--primary)] bg-[var(--primary)] text-white hover:border-[var(--primary-hover)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)]",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-[14px]",
  lg: "h-12 px-5 text-[14px]",
  icon: "h-10 w-10",
};

function baseClasses(variant: NonNullable<ButtonProps["variant"]>, size: NonNullable<ButtonProps["size"]>) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(21,94,239,0.28)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
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
