"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Button, cn } from "@rfp-os/ui";
import {
  TendyyCard,
  TendyyEmptyState,
  TendyyErrorState,
  TendyyMetricCard,
  TendyyPageHeader,
  TendyySectionHeader,
  TendyyStatusBadge,
  TendyyTable,
  type TendyyTone,
} from "./tendyy-ui";

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

function toTendyyTone(tone: RfpTone): TendyyTone {
  if (tone === "success" || tone === "warning" || tone === "danger") return tone;
  return "neutral";
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
    <TendyyPageHeader
      eyebrow={eyebrow}
      title={title}
      description={description}
      badge={status ? <RfpStatusBadge tone={statusTone(status)}>{statusLabel ?? status}</RfpStatusBadge> : null}
      actions={
        primaryAction || (secondaryActions && secondaryActions.length > 0) ? (
          <div className="flex flex-wrap gap-2">
            {secondaryActions?.map((action) => (
              <HeaderActionControl key={action.label} action={action} />
            ))}
            {primaryAction ? <HeaderActionControl action={primaryAction} /> : null}
          </div>
        ) : null
      }
    >
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
      {meta && meta.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {meta.map((item) => (
            <span key={item} className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </TendyyPageHeader>
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
    <div className="mb-3">
      <TendyySectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {count ? <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]">{count}</span> : null}
            {actions}
          </div>
        }
      />
    </div>
  );
}

export function RfpCard({ children, className }: { children: ReactNode; className?: string }) {
  return <TendyyCard className={className}>{children}</TendyyCard>;
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
    <TendyyMetricCard
      label={label}
      value={value}
      detail={<>{description}{trend ? <span className="mt-2 block"><RfpStatusBadge tone={trend.tone ?? "neutral"}>{trend.label}</RfpStatusBadge></span> : null}</>}
      icon={icon}
      loading={loading}
    />
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
  return <TendyyStatusBadge tone={toTendyyTone(tone)}>{children}</TendyyStatusBadge>;
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
    <TendyyEmptyState title={title} description={description} actionHref={actionHref} actionLabel={actionLabel} onAction={onAction} />
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
  return <TendyyErrorState title={title} message={code ? `${message} (${code})` : message} onRetry={onRetry} />;
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
  return <TendyyTable>{children}</TendyyTable>;
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
