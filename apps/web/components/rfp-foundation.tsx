"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Button, cn } from "@rfp-os/ui";

export type RfpTone = "success" | "warning" | "danger" | "neutral";

type HeaderAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  disabled?: boolean;
};

type Crumb = {
  label: string;
  href?: string;
};

function toneClasses(tone: RfpTone) {
  return tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-blue-200 bg-blue-50 text-blue-700";
}

export function statusTone(status: string): RfpTone {
  const normalized = status.trim().toUpperCase();
  if (["APPROVED", "FINAL", "ACTIVE", "SUBMITTED"].includes(normalized)) return "success";
  if (["AI_DRAFT", "DRAFT", "PENDING", "NEEDS_REVIEW", "IN_REVIEW", "REVIEW"].includes(normalized)) return "warning";
  if (["REJECTED", "ARCHIVED", "BLOCKED", "CANCELLED"].includes(normalized)) return "danger";
  return "neutral";
}

export function riskTone(risk: string): RfpTone {
  const normalized = risk.trim().toUpperCase();
  if (normalized === "CRITICAL") return "danger";
  if (normalized === "HIGH") return "warning";
  if (normalized === "MEDIUM") return "neutral";
  return "success";
}

export function RfpPageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  status,
  statusLabel,
  meta,
  primaryAction,
  secondaryActions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  status?: string;
  statusLabel?: string;
  meta?: string[];
  primaryAction?: HeaderAction;
  secondaryActions?: HeaderAction[];
}) {
  return (
    <section className="rounded-[10px] border border-[rgba(15,23,42,0.09)] bg-white/90 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] backdrop-blur">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-2">
              {crumb.href ? (
                <Link href={crumb.href} className="transition hover:text-slate-900">
                  {crumb.label}
                </Link>
              ) : (
                <span className={index === breadcrumbs.length - 1 ? "font-medium text-slate-900" : ""}>{crumb.label}</span>
              )}
              {index < breadcrumbs.length - 1 ? <span className="text-slate-300">/</span> : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="max-w-3xl">
          {eyebrow ? <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p> : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <h1 className="text-[29px] font-semibold tracking-tight text-slate-950 sm:text-[30px]">{title}</h1>
            {status ? <RfpStatusBadge tone={statusTone(status)}>{statusLabel ?? status}</RfpStatusBadge> : null}
          </div>
          {description ? <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">{description}</p> : null}
          {meta && meta.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {meta.map((item) => (
                <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {primaryAction || (secondaryActions && secondaryActions.length > 0) ? (
          <div className="flex flex-wrap gap-3">
            {secondaryActions?.map((action) => (
              <HeaderActionControl key={action.label} action={action} />
            ))}
            {primaryAction ? <HeaderActionControl action={primaryAction} /> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function RfpSectionHeader({
  eyebrow,
  title,
  description,
  actions,
  count,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  count?: string;
}) {
  return (
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <h2 className="text-[19px] font-semibold tracking-tight text-slate-950">{title}</h2>
          {count ? <span className="rounded-full border border-[rgba(15,23,42,0.09)] bg-slate-50/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">{count}</span> : null}
        </div>
        {description ? <p className="mt-1.5 max-w-3xl text-[13px] leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function RfpCard({ children, className }: { children: ReactNode; className?: string }) {
  return <article className={cn("rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]", className)}>{children}</article>;
}

export function RfpMetricCard({
  label,
  value,
  description,
  icon,
  loading,
  trend,
}: {
  label: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  loading?: boolean;
  trend?: { label: string; tone?: RfpTone };
}) {
  return (
    <div className="rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-blue-50 text-blue-700">
              {icon}
            </span>
          ) : null}
          <p className="pt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
        </div>
        <span className="rounded-full border border-transparent px-1.5 py-1 text-slate-400">
          <span className="block h-1.5 w-1.5 rounded-full bg-current shadow-[0_6px_0_currentColor,0_12px_0_currentColor]" />
        </span>
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="h-10 w-24 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-4 w-40 animate-pulse rounded-full bg-slate-100" />
        </div>
      ) : (
        <>
          <p className="mt-2.5 text-[24px] font-semibold tracking-tight text-slate-950">{value}</p>
          {description ? <p className="mt-2 text-[13px] leading-6 text-slate-600">{description}</p> : null}
          {trend ? <RfpStatusBadge tone={trend.tone ?? "neutral"}>{trend.label}</RfpStatusBadge> : null}
        </>
      )}
    </div>
  );
}

export function RfpProgress({
  label,
  value,
  completed,
  total,
  loading,
}: {
  label?: string;
  value?: number | null;
  completed?: number;
  total?: number;
  loading?: boolean;
}) {
  const percent = typeof value === "number" ? Math.max(0, Math.min(100, value)) : null;
  const progress = percent ?? (typeof completed === "number" && typeof total === "number" && total > 0 ? Math.round((completed / total) * 100) : null);

  return (
    <div className="rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      {loading ? (
        <div className="space-y-3">
          <div className="h-3.5 w-32 animate-pulse rounded-full bg-slate-100" />
          <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-slate-600">{label ?? "Progress"}</p>
            <p className="text-[13px] font-semibold text-slate-900">{progress === null ? "-" : `${progress}%`}</p>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full bg-slate-200">
            <div className="h-1.5 rounded-full bg-blue-700 transition-[width]" style={{ width: `${progress ?? 0}%` }} />
          </div>
          {typeof completed === "number" && typeof total === "number" ? (
            <p className="mt-2 text-[13px] leading-6 text-slate-600">
              {completed} / {total} completed
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function RfpStatusBadge({ tone, children }: { tone: RfpTone; children: ReactNode }) {
  return <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold ${toneClasses(tone)}`}>{children}</span>;
}

export function RfpRiskBadge({ risk }: { risk: string }) {
  return <RfpStatusBadge tone={riskTone(risk)}>{risk}</RfpStatusBadge>;
}

export function RfpLoadingState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[rgba(37,99,235,0.22)] bg-blue-50/50 p-4">
      <p className="text-[13px] font-semibold text-slate-950">{title}</p>
      {description ? <p className="mt-1.5 text-[13px] leading-6 text-slate-600">{description}</p> : null}
    </div>
  );
}

export function RfpEmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-dashed border-[rgba(37,99,235,0.22)] bg-blue-50/50 p-4 text-center">
      <p className="text-[13px] font-semibold text-slate-950">{title}</p>
      <p className="mt-1.5 text-[13px] leading-6 text-slate-600">{description}</p>
      {actionLabel ? (
        actionHref ? (
          <Button asChild className="mt-3">
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

export function RfpErrorState({
  title = "Unable to load data",
  message,
  code,
  onRetry,
}: {
  title?: string;
  message: string;
  code?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-rose-200 bg-rose-50/90 p-4 text-[13px] text-rose-900">
      <p className="font-semibold">{title}</p>
      <p className="mt-1.5">{message}</p>
      {code ? <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-rose-700">{code}</p> : null}
      {onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry} className="mt-4">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function RfpEvidenceCard({
  title,
  sourceType,
  version,
  freshness,
  relevance,
  confidence,
  description,
  verifiedAt,
  ownerId,
  used,
}: {
  title: string;
  sourceType?: string;
  version?: string | null;
  freshness?: string;
  relevance?: number;
  confidence?: number;
  description?: string;
  verifiedAt?: string | null;
  ownerId?: string | null;
  used?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white p-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-[13px] font-medium text-slate-900">{title}</p>
          {description ? <p className="mt-1 line-clamp-2 text-[13px] leading-6 text-slate-600">{description}</p> : null}
        </div>
        {used !== undefined ? <RfpStatusBadge tone={used ? "success" : "neutral"}>{used ? "Used" : "Available"}</RfpStatusBadge> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {sourceType ? <RfpStatusBadge tone="neutral">{sourceType}</RfpStatusBadge> : null}
        {version ? <RfpStatusBadge tone="neutral">{version}</RfpStatusBadge> : null}
        {freshness ? <RfpStatusBadge tone="neutral">{freshness}</RfpStatusBadge> : null}
        {ownerId ? <RfpStatusBadge tone="neutral">Owner {shortLabel(ownerId)}</RfpStatusBadge> : null}
        {verifiedAt ? <RfpStatusBadge tone="neutral">Verified {formatShortDate(verifiedAt)}</RfpStatusBadge> : null}
        {typeof relevance === "number" ? <RfpStatusBadge tone="neutral">Rel {relevance.toFixed(2)}</RfpStatusBadge> : null}
        {typeof confidence === "number" ? <RfpStatusBadge tone="neutral">Conf {confidence.toFixed(2)}</RfpStatusBadge> : null}
      </div>
    </div>
  );
}

export function RfpAnswerCard({
  question,
  answer,
  confidence,
  risk,
  lastVerified,
  evidence,
  actions,
}: {
  question: string;
  answer: ReactNode;
  confidence?: number | null;
  risk?: string;
  lastVerified?: string | null;
  evidence?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Question</p>
          <p className="mt-2 text-[19px] font-semibold tracking-tight text-slate-950">{question}</p>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Answer</p>
          <div className="mt-2 rounded-[10px] border border-slate-200 bg-slate-50 p-3.5 text-[13px] leading-6 text-slate-700">{answer}</div>
        </div>

        {evidence ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Evidence</p>
            <div className="mt-2">{evidence}</div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {typeof confidence === "number" ? (
            <InfoTile label="Confidence" value={`${Math.round(confidence * 100)}%`} />
          ) : null}
          {risk ? <InfoTile label="Risk" value={risk} valueNode={<RfpRiskBadge risk={risk} />} /> : null}
          {lastVerified ? <InfoTile label="Last verified" value={lastVerified} /> : null}
          {actions ? <InfoTile label="Actions" value="" valueNode={<div className="flex flex-wrap gap-2">{actions}</div>} /> : null}
        </div>
      </div>
    </div>
  );
}

export function RfpReviewPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function RfpTableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-slate-200">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function RfpTableHeadCell({ children }: { children: ReactNode }) {
  return <th className="px-4 py-4 text-left font-semibold">{children}</th>;
}

export function RfpTableCell({ children }: { children: ReactNode }) {
  return <td className="border-t border-slate-200 px-4 align-top">{children}</td>;
}

function InfoTile({
  label,
  value,
  valueNode,
}: {
  label: string;
  value: string;
  valueNode?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50/80 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      {valueNode ?? <p className="mt-1 font-medium text-slate-900">{value}</p>}
    </div>
  );
}

function shortLabel(value: string) {
  return value.length > 10 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function HeaderActionControl({ action }: { action: HeaderAction }) {
  if (action.href) {
    return (
      <Button
        asChild
        variant={action.variant === "secondary" ? "secondary" : action.variant === "ghost" ? "ghost" : "primary"}
        size="md"
        className={cn(action.disabled ? "pointer-events-none opacity-50" : "")}
      >
        <Link href={action.href}>{action.loading ? "Working..." : action.label}</Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
      variant={action.variant === "secondary" ? "secondary" : action.variant === "ghost" ? "ghost" : "primary"}
      size="md"
    >
      {action.loading ? "Working..." : action.label}
    </Button>
  );
}
