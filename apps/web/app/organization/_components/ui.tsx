"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@rfp-os/ui";

import { RfpEmptyState } from "../../../components/rfp-foundation";
import type { ActivityItem } from "../../../lib/models";
import { formatCount, formatStatus, initials, relativeTime, workspaceLabel } from "./format";

/** A tab body. Hidden (not unmounted) when inactive so deep links keep working. */
export function TabPanel({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  return (
    <section
      id={id}
      className={[
        "rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)] transition-opacity duration-200",
        active ? "opacity-100" : "hidden opacity-0",
      ].join(" ")}
    >
      {children}
    </section>
  );
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/** Stands in for window.confirm: states the consequence and names the action. */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  if (!request) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <section className="w-full max-w-md rounded-[12px] border border-slate-200 bg-white p-5 shadow-2xl">
        <h2 id="confirm-title" className="text-lg font-semibold tracking-tight text-slate-950">{request.title}</h2>
        <p id="confirm-message" className="mt-2 text-sm leading-6 text-slate-600">{request.message}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} autoFocus>Cancel</Button>
          <Button
            type="button"
            variant="primary"
            className={request.destructive ? "!bg-rose-700 hover:!bg-rose-800" : undefined}
            onClick={() => {
              request.onConfirm();
              onClose();
            }}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-2 text-[19px] font-semibold leading-[1.05] tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="inline-flex items-center gap-1 self-start pt-0.5 text-[13px] font-semibold text-[#155EEF]">
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

export function SummaryPanel({ title, rows }: { title: string; rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-[13px] font-semibold text-slate-900">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3">
            <span className="text-[13px] text-slate-500">{row.label}</span>
            <span className="text-right text-[13px] font-medium text-slate-900">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-slate-900">{value}</p>
    </div>
  );
}

export function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-[24px] font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-[13px] leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

export function MiniMetric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-1 text-[17px] font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

export function StatusBar({ label, value, tone, total }: { label: string; value: number; tone: "success" | "warning" | "neutral"; total: number }) {
  const width = total > 0 ? Math.max(8, Math.round((value / total) * 100)) : 0;
  const palette = tone === "success" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : "bg-slate-400";
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-950">{formatCount(value)}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${palette}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function UsageRow({ label, value, progress }: { label: string; value: string; progress: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-950">{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-[#155EEF]" style={{ width: `${Math.min(100, Math.max(8, progress))}%` }} />
      </div>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-slate-900">{value}</p>
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#EFF5FF] text-[12px] font-semibold text-[#155EEF]">
      {initials(name)}
    </div>
  );
}

export function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-slate-950">{item.summary || item.label}</p>
          <p className="mt-1 text-[12px] text-slate-500">
            {item.actorLabel || "System"}
            {item.kind ? ` · ${item.kind.replace(/_/g, " ")}` : ""}
          </p>
        </div>
        <span className="whitespace-nowrap text-[11px] text-slate-400">{relativeTime(item.createdAt)}</span>
      </div>
    </div>
  );
}

export function AuditRow({
  audit,
  workspaces,
}: {
  audit: { id: string; action: string; entityType: string; entityId: string; workspaceId: string | null; actorType: string; createdAt: string };
  workspaces: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-slate-950">{formatStatus(audit.action)}</p>
          <p className="mt-1 text-[12px] text-slate-500">
            {audit.entityType}
            {audit.workspaceId ? ` · ${workspaceLabel(audit.workspaceId, workspaces)}` : ""}
          </p>
        </div>
        <span className="whitespace-nowrap text-[11px] text-slate-400">{relativeTime(audit.createdAt)}</span>
      </div>
    </div>
  );
}

export function Th({ children }: { children?: ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

export function Td({ children }: { children: ReactNode }) {
  return <td className="border-t border-slate-200 px-4 align-top">{children}</td>;
}

export function EmptyNotice({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return (
    <div className={compact ? "py-2" : "mt-4"}>
      <RfpEmptyState title={title} description={description} />
    </div>
  );
}
