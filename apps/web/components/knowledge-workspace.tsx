"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@rfp-os/ui";

import { AppShell } from "./app-shell";
import { RfpEmptyState, RfpErrorState, RfpSectionHeader, RfpStatusBadge } from "./rfp-foundation";
import { ApiError } from "../lib/api";
import {
  useApproveKnowledge,
  useArchiveKnowledge,
  useCreateKnowledge,
  useKnowledgeItem,
  useKnowledgeList,
  useKnowledgeSummary,
  useUpdateKnowledge,
} from "../lib/queries";

export function KnowledgeWorkspaceClient() {
  const [statusFilter, setStatusFilter] = useState<"all" | "DRAFT" | "ACTIVE" | "ARCHIVED">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const knowledgeSummaryQuery = useKnowledgeSummary();
  const knowledgeQuery = useKnowledgeList({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: search.trim() || undefined,
    page,
    pageSize,
  });
  const createKnowledge = useCreateKnowledge();
  const updateKnowledge = useUpdateKnowledge();
  const approveKnowledge = useApproveKnowledge();
  const archiveKnowledge = useArchiveKnowledge();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "",
    category: "Security",
    version: "1.0",
    authority: "medium",
    summary: "",
    lastVerified: "",
    expiresAt: "",
  });

  const selectedKnowledgeQuery = useKnowledgeItem(selectedId);
  const selected = selectedKnowledgeQuery.data ?? null;
  const items = useMemo(() => knowledgeQuery.data?.items ?? [], [knowledgeQuery.data?.items]);
  const total = knowledgeQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const knowledgeCounts = knowledgeSummaryQuery.data?.counts ?? { total: 0, draft: 0, active: 0, archived: 0, stale: 0 };

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]!.id);
    }
  }, [items, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setForm({
      name: selected.name ?? "",
      type: selected.type ?? "",
      category: selected.category ?? "Security",
      version: selected.version ?? "1.0",
      authority: selected.authority ?? "medium",
      summary: selected.summary ?? "",
      lastVerified: selected.lastVerified ?? "",
      expiresAt: selected.expiresAt ?? "",
    });
  }, [selected]);

  const counts = {
    active: knowledgeCounts.active,
    draft: knowledgeCounts.draft,
    archived: knowledgeCounts.archived,
  };

  const submitCreate = async () => {
    const created = await createKnowledge.mutateAsync({
      name: form.name,
      type: form.type,
      category: form.category,
      version: form.version,
      authority: form.authority as "high" | "medium" | "low",
      summary: form.summary,
      lastVerified: form.lastVerified || undefined,
      expiresAt: form.expiresAt || undefined,
    });
    setSelectedId(created.id);
  };

  const submitUpdate = async () => {
    if (!selectedId) return;
    await updateKnowledge.mutateAsync({
      id: selectedId,
      body: {
        name: form.name,
        type: form.type,
        category: form.category,
        version: form.version,
        authority: form.authority as "high" | "medium" | "low",
        summary: form.summary,
        lastVerified: form.lastVerified || undefined,
        expiresAt: form.expiresAt || null,
      },
    });
  };

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Knowledge" }]}>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Knowledge base</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Knowledge</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Draft, review, active, and archived knowledge in one managed lifecycle view.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <StatChip label="Active" value={String(counts.active)} />
              <StatChip label="Draft" value={String(counts.draft)} />
              <StatChip label="Archived" value={String(counts.archived)} />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_1.2fr]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <SectionTitle
              eyebrow="Knowledge lifecycle"
              title="Knowledge sources"
              subtitle="Browse the current library and open a source to edit, approve, or archive."
            />

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_180px]">
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Search knowledge sources..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setPage(1);
                  setStatusFilter(event.target.value as "all" | "DRAFT" | "ACTIVE" | "ARCHIVED");
                }}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
              >
                <option value="all">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            {knowledgeQuery.error ? <ErrorBanner error={knowledgeQuery.error} /> : null}
            {knowledgeQuery.isLoading ? <PanelState label="Loading knowledge" /> : null}

            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={[
                    "w-full rounded-3xl border p-4 text-left transition",
                    selectedId === item.id
                      ? "border-sky-300 bg-sky-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-sky-200",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{item.name}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.type} - {item.category}
                      </p>
                    </div>
                    <StatusPill tone={statusTone(item.status)}>{item.status}</StatusPill>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <StatusPill tone="neutral">v{item.version}</StatusPill>
                    <StatusPill tone="neutral">{item.authority}</StatusPill>
                    <StatusPill tone="neutral">{item.lastUpdated}</StatusPill>
                  </div>
                </button>
              ))}

              {!knowledgeQuery.isLoading && items.length === 0 ? (
                <PanelState label="No knowledge items match the current filters." />
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 text-sm text-slate-600">
              <p>
                Showing {items.length} of {total} source{total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
              <SectionTitle
                eyebrow="Create / edit"
                title="Knowledge item"
                subtitle="Validate the same fields the backend expects and keep lifecycle state authoritative."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Name" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
                <InputField label="Type" value={form.type} onChange={(value) => setForm((prev) => ({ ...prev, type: value }))} />
                <InputField label="Category" value={form.category} onChange={(value) => setForm((prev) => ({ ...prev, category: value }))} />
                <InputField label="Version" value={form.version} onChange={(value) => setForm((prev) => ({ ...prev, version: value }))} />
                <InputField label="Authority" value={form.authority} onChange={(value) => setForm((prev) => ({ ...prev, authority: value }))} />
                <InputField label="Last verified" value={form.lastVerified} onChange={(value) => setForm((prev) => ({ ...prev, lastVerified: value }))} />
                <InputField label="Expires at" value={form.expiresAt} onChange={(value) => setForm((prev) => ({ ...prev, expiresAt: value }))} />
              </div>

              <label className="mt-4 block text-sm font-medium text-slate-700">
                Summary
                <textarea
                  value={form.summary}
                  onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
                  rows={8}
                  className="mt-2 w-full rounded-3xl border border-slate-300 bg-white p-4 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton onClick={submitCreate} loading={createKnowledge.isPending}>
                  Create Knowledge
                </ActionButton>
                <ActionButton onClick={submitUpdate} loading={updateKnowledge.isPending} variant="secondary" disabled={!selectedId}>
                  Save Changes
                </ActionButton>
              </div>
            </article>

            <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
              <SectionTitle
                eyebrow="Lifecycle"
                title="Approval and archive"
                subtitle="Only the backend can move a knowledge source through the lifecycle."
              />
              {selected ? (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Selected</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{selected.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{selected.summary}</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <ActionButton onClick={() => approveKnowledge.mutate(selected.id)} loading={approveKnowledge.isPending}>
                      Approve
                    </ActionButton>
                    <ActionButton onClick={() => archiveKnowledge.mutate(selected.id)} loading={archiveKnowledge.isPending} variant="secondary">
                      Archive
                    </ActionButton>
                  </div>

                  <div className="grid gap-3 text-sm">
                    <InfoRow label="Status" value={selected.status} />
                    <InfoRow label="Owner" value={selected.ownerId} />
                    <InfoRow label="Updated" value={selected.lastUpdated} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Claims</p>
                    <div className="mt-3 space-y-2">
                      {(selected.claims ?? []).map((claim) => (
                        <div key={`${claim.label}-${claim.value}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <p className="font-medium text-slate-950">{claim.label}</p>
                          <p className="mt-1 text-sm text-slate-600">{claim.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Versions</p>
                    <div className="mt-3 space-y-2">
                      {(selected.versions ?? []).map((version) => (
                        <div key={version.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-slate-950">v{version.version}</p>
                            <StatusPill tone="neutral">{version.date}</StatusPill>
                          </div>
                          <p className="mt-1 text-slate-600">{version.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <PanelState label="Select a knowledge item to review lifecycle and version history." />
              )}
            </article>
          </section>
        </section>
      </div>
    </AppShell>
  );
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <RfpSectionHeader eyebrow={eyebrow} title={title} description={subtitle} />;
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
      />
    </label>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  const message = error instanceof ApiError ? error.message : "Something went wrong";
  return <RfpErrorState title="Request failed" message={message} />;
}

function PanelState({ label }: { label: string }) {
  return <RfpEmptyState title={label} description="There is nothing to show in this section yet." />;
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: React.ReactNode }) {
  return <RfpStatusBadge tone={tone}>{children}</RfpStatusBadge>;
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "warning";
  if (status === "ARCHIVED") return "neutral";
  return "neutral";
}

function ActionButton({
  children,
  loading,
  variant,
  ...props
}: React.ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button
      {...props}
      variant={variant ?? "primary"}
      disabled={loading || props.disabled}
      className={variant === "secondary" ? "bg-slate-100 text-slate-900 hover:bg-slate-200" : undefined}
    >
      {loading ? "Working..." : children}
    </Button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 px-3 py-2 shadow-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}
