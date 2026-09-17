"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight, CircleAlert, LockKeyhole, RefreshCw, X } from "lucide-react";

import { Button, cn } from "@rfp-os/ui";

export type TendyyTone = "success" | "warning" | "danger" | "neutral" | "primary";
export type TendyyDensity = "default" | "compact" | "table";

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
  density = "default",
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  density?: TendyyDensity;
}) {
  const padding = density === "compact" ? "p-3 sm:p-4" : density === "table" ? "p-0" : "p-4 sm:p-5";
  return (
    <header className={cn("tendyy-surface", padding, className)}>
      {children}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{eyebrow}</p> : null}
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
        {eyebrow ? <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{eyebrow}</p> : null}
        <h2 className="text-[var(--font-size-section-title)] font-semibold tracking-normal text-[var(--text)]">{title}</h2>
        {description ? <p className="mt-1.5 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">{description}</p> : null}
      </div>
      {actions ?? (actionHref && actionLabel ? <TextLink href={actionHref}>{actionLabel}</TextLink> : null)}
    </div>
  );
}

export function TendyyCard({ children, className, density = "default" }: { children: ReactNode; className?: string; density?: TendyyDensity }) {
  const padding = density === "compact" ? "p-3 sm:p-4" : density === "table" ? "p-0" : "p-4 sm:p-5";
  return <section className={cn("tendyy-surface min-w-0", padding, className)}>{children}</section>;
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
        {icon ? <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]", toneIconClass(tone))}>{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{label}</p>
          {loading ? <div className="mt-2 h-8 w-20 animate-pulse rounded-[8px] bg-[var(--neutral-soft)]" /> : <p className="mt-1 text-[26px] font-semibold leading-8 tracking-normal text-[var(--text)]">{value}</p>}
          {detail ? <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">{detail}</p> : null}
        </div>
      </div>
    </article>
  );
}

export function TendyyStatusBadge({ tone = "neutral", children }: { tone?: TendyyTone; children: ReactNode }) {
  return <span className={cn("inline-flex h-6 items-center rounded-[6px] border px-2 text-[11px] font-semibold", toneBadgeClass(tone))}>{children}</span>;
}

export function TendyyTable({ children, mobile, minWidth = 760 }: { children: ReactNode; mobile?: ReactNode; minWidth?: number }) {
  void minWidth;
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-white">
      <div className={mobile ? "hidden xl:block" : "block"}><table className="w-full table-fixed border-collapse text-left text-[13px]">{children}</table></div>
      {mobile ? <div className="min-w-0 xl:hidden">{mobile}</div> : null}
    </div>
  );
}

export type TendyyNavItem = { value: string; label: string };

export function TendyyResponsiveNav({ items, value, onChange, label = "Section" }: { items: TendyyNavItem[]; value: string; onChange: (value: string) => void; label?: string }) {
  return <>
    <label className="block min-w-0 md:hidden">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--text-soft)]" aria-label={label}>
        {items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
    <nav className="hidden min-w-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--border)] md:flex" aria-label={label}>
      {items.map((item) => <button type="button" key={item.value} onClick={() => onChange(item.value)} aria-current={value === item.value ? "page" : undefined} className={cn("relative pb-3 text-[13px] font-semibold", value === item.value ? "text-[var(--primary)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--primary)]" : "text-[var(--muted)] hover:text-[var(--text-soft)]")}>{item.label}</button>)}
    </nav>
  </>;
}

export function TendyyResponsiveDataView({ desktop, mobile, className }: { desktop: ReactNode; mobile: ReactNode; className?: string }) {
  return <div className={cn("min-w-0 max-w-full", className)}><div className="hidden min-w-0 xl:block">{desktop}</div><div className="min-w-0 xl:hidden">{mobile}</div></div>;
}

export function TendyyActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>{children}</div>;
}

export function TendyyFormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function TendyyMasterDetail({ master, detail, className }: { master: ReactNode; detail: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]", className)}><div className="min-w-0">{master}</div><div className="min-w-0">{detail}</div></div>;
}

export function TendyySheet({ open, title, onClose, children, footer, className }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; className?: string }) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const root = panelRef.current?.parentElement;
    if (root && window.getComputedStyle(root).display === "none") return;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const elements = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const first = elements[0]; const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = previousOverflow; trigger?.focus(); };
  }, [open]);
  if (!open) return null;
  return <div className={cn("fixed inset-0 z-50", className)}><button type="button" className="absolute inset-0 h-full w-full bg-slate-950/30" onClick={onClose} aria-label={`Close ${title}`} /><aside ref={panelRef} role="dialog" aria-modal="true" aria-label={title} className="absolute inset-y-0 right-0 flex w-full min-w-0 max-w-[min(440px,100vw)] flex-col overflow-hidden border-l border-[var(--border)] bg-white shadow-[var(--shadow-elevated)]"><header className="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--border)] p-4"><h2 className="tendyy-wrap-anywhere min-w-0 text-base font-semibold text-[var(--text)]">{title}</h2><button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--surface-muted)]" aria-label={`Close ${title}`}><X className="h-4 w-4" aria-hidden="true" /></button></header><div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4">{children}</div>{footer ? <footer className="min-w-0 border-t border-[var(--border)] p-4">{footer}</footer> : null}</aside></div>;
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

export function TendyyField({
  label,
  children,
  required,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0 text-[12px] font-semibold text-[var(--text-soft)]", className)}>
      <span>{label}{required ? <span className="text-[var(--danger)]"> *</span> : null}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1.5 block text-[11px] font-normal leading-5 text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export const tendyyInputClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-white px-3 py-2 text-sm text-[var(--text)] outline-none transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(21,94,239,0.1)] disabled:bg-[var(--surface-muted)] disabled:text-[var(--muted)]";

export function TendyyProgress({ value, label }: { value: number | null | undefined; label?: string }) {
  const progress = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--text-soft)]">
        <span>{label ?? "Progress"}</span>
        <span>{typeof value === "number" ? `${Math.round(progress)}%` : "-"}</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-[var(--border)]">
        <div className="h-1.5 bg-[var(--primary)]" style={{ width: `${progress}%` }} />
      </div>
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
