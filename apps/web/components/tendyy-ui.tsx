"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CircleAlert, LockKeyhole, RefreshCw } from "lucide-react";

import { Button, cn } from "@rfp-os/ui";

export type TendyyTone = "success" | "warning" | "danger" | "neutral" | "primary";

export function toneFromStatus(status: string | null | undefined): TendyyTone {
  const value = (status ?? "").trim().toUpperCase();
  if (["ACTIVE", "APPROVED", "VERIFIED", "READY", "SUBMITTED", "COMPLETE", "CONNECTED"].includes(value)) return "success";
  if (["PENDING", "DRAFT", "AI_DRAFT", "IN_REVIEW", "REVIEW", "NEEDS_REVIEW", "AGING", "PROCESSING", "UPLOADED"].includes(value)) return "warning";
  if (["CRITICAL", "CONFLICTING", "FAILED", "REJECTED", "BLOCKED", "ARCHIVED", "STALE", "REMOVED", "EXPIRED"].includes(value)) return "danger";
  return "neutral";
}

export function TendyyPageHeader({
  eyebrow,
  title,
  description,
  badge,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("tendyy-surface p-4 sm:p-5", className)}>
      {children}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">{eyebrow}</p> : null}
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="min-w-0 text-[var(--font-size-page-title)] font-semibold tracking-normal text-[var(--text)]">{title}</h1>
            {badge}
          </div>
          {description ? <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function TendyySectionHeader({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{eyebrow}</p> : null}
        <h2 className="text-[var(--font-size-section-title)] font-semibold tracking-normal text-[var(--text)]">{title}</h2>
        {description ? <p className="mt-1.5 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">{description}</p> : null}
      </div>
      {actions ?? (actionHref && actionLabel ? <TextLink href={actionHref}>{actionLabel}</TextLink> : null)}
    </div>
  );
}

export function TendyyCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("tendyy-surface min-w-0 p-4 sm:p-5", className)}>{children}</section>;
}

export function TendyyMetricCard({
  label,
  value,
  detail,
  icon,
  loading,
  tone = "primary",
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  tone?: TendyyTone;
  className?: string;
}) {
  return (
    <article className={cn("tendyy-surface min-w-0 p-4", className)}>
      <div className="flex items-start gap-3">
        {icon ? <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]", toneIconClass(tone))}>{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{label}</p>
          {loading ? <div className="mt-2 h-8 w-20 animate-pulse rounded-[8px] bg-[var(--neutral-soft)]" /> : <p className="mt-1 text-[26px] font-semibold leading-8 tracking-normal text-[var(--text)]">{value}</p>}
          {detail ? <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">{detail}</p> : null}
        </div>
      </div>
    </article>
  );
}

export function TendyyStatusBadge({ tone = "neutral", children }: { tone?: TendyyTone; children: ReactNode }) {
  return <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold", toneBadgeClass(tone))}>{children}</span>;
}

export function TendyyTable({ children, minWidth = 760 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth }}>{children}</table>
      </div>
    </div>
  );
}

export function TendyyEmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[rgba(21,94,239,0.28)] bg-[var(--primary-soft)]/60 p-5 text-center">
      <p className="text-[13px] font-semibold text-[var(--text)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-xl text-[13px] leading-6 text-[var(--muted)]">{description}</p>
      {actionLabel ? (
        actionHref ? (
          <Button asChild className="mt-4">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : (
          <Button type="button" onClick={onAction} className="mt-4">
            {actionLabel}
          </Button>
        )
      ) : null}
    </div>
  );
}

export function TendyyErrorState({ title = "Unable to load data", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-900" role="alert">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-1.5 leading-6">{message}</p>
          {onRetry ? (
            <Button type="button" variant="secondary" onClick={onRetry} className="mt-3">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TendyyPermissionState({ title = "Permission required", message }: { title?: string; message: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-4 text-[13px] text-[var(--muted)]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--neutral-soft)] text-[var(--neutral)]">
          <LockKeyhole className="h-4 w-4" />
        </span>
        <div>
          <p className="font-semibold text-[var(--text)]">{title}</p>
          <p className="mt-1.5 leading-6">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)]">
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export function TendyySkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-white p-3">
          <div className="h-9 w-9 rounded-[9px] bg-[var(--neutral-soft)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/5 rounded-full bg-[var(--neutral-soft)]" />
            <div className="h-2.5 w-2/5 rounded-full bg-[var(--neutral-soft)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function toneIconClass(tone: TendyyTone) {
  if (tone === "success") return "bg-[var(--success-soft)] text-[var(--success)]";
  if (tone === "warning") return "bg-[var(--warning-soft)] text-[var(--warning)]";
  if (tone === "danger") return "bg-[var(--danger-soft)] text-[var(--danger)]";
  if (tone === "neutral") return "bg-[var(--neutral-soft)] text-[var(--neutral)]";
  return "bg-[var(--primary-soft)] text-[var(--primary)]";
}

function toneBadgeClass(tone: TendyyTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-800";
  if (tone === "primary") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-[var(--border)] bg-[var(--neutral-soft)] text-[var(--neutral)]";
}
