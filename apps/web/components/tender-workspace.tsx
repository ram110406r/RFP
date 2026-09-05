"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bookmark, Building2, CalendarClock, Database, Eye, FileText, MapPin, Sparkles, UploadCloud, X } from "lucide-react";

import { Button } from "@rfp-os/ui";

import { AppShell } from "./app-shell";
import {
  RfpAnswerCard,
  RfpCard,
  RfpEmptyState,
  RfpErrorState,
  RfpEvidenceCard,
  RfpPageHeader,
  RfpReviewPanel,
  RfpSectionHeader,
  RfpStatusBadge,
} from "./rfp-foundation";
import {
  TendyyCard,
  TendyyEmptyState,
  TendyyErrorState,
  TendyyMetricCard,
  TendyyPageHeader,
  TendyySectionHeader,
  TendyySkeletonRows,
  TendyyStatusBadge,
  toneFromStatus,
} from "./tendyy-ui";
import { ApiError } from "../lib/api";
import type { AnswerAnalysisResult, AnswerImprovementResult } from "@rfp-os/types";
import type {
  AnswerGenerationPayload,
  EvidenceCandidate,
  TenderBriefPayload,
  TenderAnswer,
  TenderAnswerVersion,
  TenderDocument,
  TenderRequirement,
  TenderSource,
  TenderTimelineItem,
  WorkspaceOverview,
} from "../lib/models";
import {
  useAnalyzeAnswer,
  useAnswerEvidence,
  useAnswerVersions,
  useGenerateAnswer,
  useImproveAnswer,
  useRegenerateAnswer,
  useRequirementEvidence,
  useSaveTender,
  useSaveAnswer,
  useSubmitReview,
  useTenderAnswers,
  useTenderBrief,
  useTenderDocumentContent,
  useTenderQuestions,
  useTenderRequirements,
  useTenderReviews,
  useTenderSources,
  useParseTenderSource,
  useTenderWorkspace,
  useUnsaveTender,
} from "../lib/queries";
import { getGenerationId, getGenerationMeta, reviewToneFromStatus } from "../lib/workspace-utils";
import { ApplyAutomationPanel } from "./apply-automation-panel";

type TenderWorkspaceClientProps = {
  tenderId: string;
  initialOverview?: WorkspaceOverview | null;
};

type RequirementWorkspaceClientProps = {
  tenderId: string;
  requirementId: string;
  initialOverview?: WorkspaceOverview | null;
};

type RequirementsIndexClientProps = {
  tenderId: string;
  initialOverview?: WorkspaceOverview | null;
};

export function TenderWorkspaceClient({ tenderId, initialOverview }: TenderWorkspaceClientProps) {
  const overviewQuery = useTenderWorkspace(tenderId, initialOverview ?? null);
  const requirementsQuery = useTenderRequirements(tenderId, initialOverview?.requirements ? { items: initialOverview.requirements } : null);
  const sourcesQuery = useTenderSources(tenderId);
  const parseSourceMutation = useParseTenderSource(tenderId);
  const saveTenderMutation = useSaveTender();
  const unsaveTenderMutation = useUnsaveTender();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const documentContentQuery = useTenderDocumentContent(tenderId, selectedDocumentId);

  const overview = overviewQuery.data;
  const tender = overview?.tender;
  const requirements = requirementsQuery.data?.items ?? overview?.requirements ?? [];
  const sources = sourcesQuery.data?.items ?? overview?.sources ?? [];
  const documents = overview?.documents ?? [];
  const timeline = overview?.timeline ?? [];
  const counts = overview?.counts;
  const savePending = saveTenderMutation.isPending || unsaveTenderMutation.isPending;
  const selectedDocument = selectedDocumentId
    ? documents.find((document) => document.id === selectedDocumentId) ?? null
    : null;

  function toggleSaved() {
    if (!tender || savePending) return;
    if (tender.saved) {
      unsaveTenderMutation.mutate(tender.id);
    } else {
      saveTenderMutation.mutate(tender.id);
    }
  }

  if (overviewQuery.isLoading && !overview) {
    return (
      <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Tenders", href: "/tenders" }, { label: "Tender" }]}>
        <div className="space-y-5">
          <TendyyPageHeader eyebrow="Tender workspace" title="Loading tender workspace" description="Fetching persisted tender data from the backend." />
          <TendyyCard>
            <TendyySkeletonRows count={5} />
          </TendyyCard>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Tenders", href: "/tenders" }, { label: tender?.title ?? "Tender" }]}>
      <div className="space-y-6">
        <TendyyPageHeader
          eyebrow="Tender workspace"
          title={tender?.title ?? "Tender workspace"}
          description={tender ? tenderDescription(tender) : "Persisted tender data will appear here when the backend responds."}
          badge={tender ? <TendyyStatusBadge tone={toneFromStatus(tender.status)}>{tender.status}</TendyyStatusBadge> : null}
          actions={
            tender ? (
              <>
                <Button type="button" variant="secondary" onClick={toggleSaved} disabled={savePending}>
                  <Bookmark className="h-4 w-4" />
                  {savePending ? "Saving..." : tender.saved ? "Saved" : "Save"}
                </Button>
                <Button asChild>
                  <Link href={`/apply/${tender.id}`}>Continue response</Link>
                </Button>
              </>
            ) : null
          }
        />

        {overviewQuery.error ? (
          <TendyyErrorState title="Unable to load tender workspace" message={errorText(overviewQuery.error)} onRetry={() => void overviewQuery.refetch()} />
        ) : null}
        {saveTenderMutation.error ? <TendyyErrorState title="Unable to save tender" message={errorText(saveTenderMutation.error)} /> : null}
        {unsaveTenderMutation.error ? <TendyyErrorState title="Unable to update saved tender" message={errorText(unsaveTenderMutation.error)} /> : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TendyyMetricCard label="Deadline" value={formatTenderDate(tender?.dueAt)} detail={tender?.timezone ?? "UTC"} icon={<CalendarClock className="h-5 w-5" />} tone={deadlineTone(tender?.dueAt)} />
          <TendyyMetricCard label="Requirements" value={counts?.requirements ?? requirements.length} detail={`${counts?.questions ?? 0} questions mapped`} icon={<FileText className="h-5 w-5" />} tone="primary" />
          <TendyyMetricCard label="Documents" value={counts?.documents ?? documents.length} detail={`${counts?.processedDocuments ?? 0} processed, ${counts?.pendingDocuments ?? 0} pending`} icon={<UploadCloud className="h-5 w-5" />} tone={(counts?.pendingDocuments ?? 0) > 0 ? "warning" : "success"} />
          <TendyyMetricCard label="Estimated value" value={formatTenderValue(tender?.estimatedValue, tender?.currency)} detail={tender?.location || "Location not provided"} icon={<Database className="h-5 w-5" />} tone="neutral" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <TendyyCard>
            <TendyySectionHeader eyebrow="Overview" title="Tender record" description="This is the persisted tender metadata from PostgreSQL." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <OperationalField label="Buyer" value={tender?.buyerName || tender?.name} icon={<Building2 className="h-4 w-4" />} />
              <OperationalField label="Location" value={tender?.location} icon={<MapPin className="h-4 w-4" />} />
              <OperationalField label="Reference" value={tender?.referenceNumber} />
              <OperationalField label="Tender type" value={tender?.tenderType} />
              <OperationalField label="Source type" value={tender?.sourceType} />
              <OperationalField label="Source URL" value={tender?.sourceUrl} href={tender?.sourceUrl ?? undefined} />
            </div>
            <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--neutral-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Description</p>
              <p className="mt-2 text-[13px] leading-6 text-[var(--text)]">{tender?.description || "No description has been provided for this tender yet."}</p>
            </div>
          </TendyyCard>

          <TendyyCard>
            <TendyySectionHeader eyebrow="Application control" title="Human-gated automation" description="Preparation runs only when a permitted user explicitly starts it. Approval and submission always remain human actions." />
            <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-md)] border border-blue-200 bg-blue-50 p-4 text-blue-950">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-[13px] leading-6">Generated answers preserve evidence links and version history. Missing evidence creates visible work instead of unsupported text.</p>
            </div>
          </TendyyCard>
        </section>

        {tender ? <ApplyAutomationPanel tender={tender} /> : null}

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <TendyyCard>
            <TendyySectionHeader
              eyebrow="Sources and documents"
              title="Intake state"
              description="Source and document rows come from the existing upload, completion, and parse pipeline."
              actionHref="/tenders/import"
              actionLabel="Import documents"
            />
            <div className="mt-5 space-y-3">
              {sourcesQuery.error ? <TendyyErrorState title="Unable to load tender sources" message={errorText(sourcesQuery.error)} onRetry={() => void sourcesQuery.refetch()} /> : null}
              {sources.length > 0 || documents.length > 0 ? (
                <>
                  {sources.map((source) => (
                    <OperationalSourceCard
                      key={source.id}
                      source={source}
                      isParsing={parseSourceMutation.isPending && parseSourceMutation.variables === source.id}
                      disabled={parseSourceMutation.isPending && parseSourceMutation.variables !== source.id}
                      onParse={() => parseSourceMutation.mutate(source.id)}
                    />
                  ))}
                  {documents.map((document) => (
                    <OperationalDocumentCard
                      key={document.id}
                      document={document}
                      source={sources.find((source) => source.id === document.tenderSourceId) ?? null}
                      isParsing={parseSourceMutation.isPending && parseSourceMutation.variables === document.tenderSourceId}
                      disabled={parseSourceMutation.isPending}
                      onViewContent={() => setSelectedDocumentId(document.id)}
                      onParse={() => {
                        if (document.tenderSourceId) parseSourceMutation.mutate(document.tenderSourceId);
                      }}
                    />
                  ))}
                  {selectedDocument ? (
                    <OperationalDocumentContentPanel
                      document={selectedDocument}
                      query={documentContentQuery}
                      onClose={() => setSelectedDocumentId(null)}
                    />
                  ) : null}
                </>
              ) : (
                <TendyyEmptyState title="No sources or documents" description="This tender has no persisted source uploads or linked tender documents yet." actionHref="/tenders/import" actionLabel="Import documents" />
              )}
              {parseSourceMutation.error ? <TendyyErrorState title="Unable to parse source" message={errorText(parseSourceMutation.error)} /> : null}
            </div>
          </TendyyCard>

          <TendyyCard>
            <TendyySectionHeader eyebrow="Requirements" title="Persisted requirement map" description="Only real extracted or manually-created requirements are shown." actionHref={`/tenders/${tenderId}/requirements`} actionLabel="Open requirements" />
            <div className="mt-5 space-y-3">
              {requirementsQuery.error ? <TendyyErrorState title="Unable to load requirements" message={errorText(requirementsQuery.error)} onRetry={() => void requirementsQuery.refetch()} /> : null}
              {requirements.length > 0 ? (
                requirements.slice(0, 8).map((requirement) => <OperationalRequirementRow key={requirement.id} tenderId={tenderId} requirement={requirement} />)
              ) : (
                <TendyyEmptyState title="No requirements yet" description="Requirements will appear after the existing parser or manual requirement workflow creates them." />
              )}
            </div>
          </TendyyCard>
        </section>

        <TendyyCard>
          <TendyySectionHeader eyebrow="Timeline" title="Tender activity" description="Recent activity events recorded for this tender and workspace." />
          <div className="mt-5">
            {timeline.length > 0 ? (
              <div className="space-y-3">
                {timeline.map((item) => <OperationalTimelineRow key={item.id} item={item} />)}
              </div>
            ) : (
              <TendyyEmptyState title="No activity yet" description="Timeline rows will appear as users create, update, save, parse, approve, or submit this tender." />
            )}
          </div>
        </TendyyCard>
      </div>
    </AppShell>
  );
}

function OperationalField({ label, value, href, icon }: { label: string; value?: string | null; href?: string; icon?: React.ReactNode }) {
  const content = value ? value : "Not provided";
  return (
    <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white p-3">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
        {icon}
        {label}
      </p>
      {href && value ? (
        <a href={href} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[13px] font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)]">
          {content}
        </a>
      ) : (
        <p className="mt-1 truncate text-[13px] font-semibold text-[var(--text)]">{content}</p>
      )}
    </div>
  );
}

function OperationalSourceCard({ source, isParsing, disabled, onParse }: { source: TenderSource; isParsing: boolean; disabled: boolean; onParse: () => void }) {
  const parsed = source.parseStatus === "PARSED";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13px] font-semibold text-[var(--text)]">{source.name}</p>
            <TendyyStatusBadge tone={toneFromStatus(source.parseStatus)}>{source.parseStatus}</TendyyStatusBadge>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
            {[source.sourceType, source.mimeType, formatBytes(source.fileSize), formatTenderDate(source.createdAt)].filter(Boolean).join(" | ")}
          </p>
          {source.sourceUrl ? <p className="mt-1 truncate text-[12px] text-[var(--primary)]">{source.sourceUrl}</p> : null}
        </div>
        <Button type="button" variant="secondary" disabled={disabled || parsed} onClick={onParse}>
          {isParsing ? "Parsing..." : parsed ? "Parsed" : "Parse"}
        </Button>
      </div>
    </div>
  );
}

function OperationalDocumentCard({
  document,
  source,
  isParsing,
  disabled,
  onViewContent,
  onParse,
}: {
  document: TenderDocument;
  source: TenderSource | null;
  isParsing: boolean;
  disabled: boolean;
  onViewContent: () => void;
  onParse: () => void;
}) {
  const canParse = Boolean(document.tenderSourceId) && document.status !== "PROCESSING" && document.status !== "PROCESSED";
  const canViewContent = document.status === "PROCESSED";
  const extractedDetail =
    document.extractionStatus === "succeeded"
      ? [
          document.pageCount ? `${document.pageCount} ${document.pageCount === 1 ? "page" : "pages"}` : null,
          document.contentBlocks ? `${document.contentBlocks} ${document.contentBlocks === 1 ? "block" : "blocks"}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || "Content extracted"
      : null;
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13px] font-semibold text-[var(--text)]">{document.name}</p>
            <TendyyStatusBadge tone={toneFromStatus(document.status)}>{document.status}</TendyyStatusBadge>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
            {[document.documentRole, document.mimeType, formatBytes(document.fileSize), `Uploaded ${formatTenderDate(document.uploadedAt)}`].filter(Boolean).join(" | ")}
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {[document.tenderSourceId ? `Source ${document.tenderSourceId}` : "No linked source", source ? `Source ${source.parseStatus}` : null, document.processedAt ? `Processed ${formatTenderDate(document.processedAt)}` : null].filter(Boolean).join(" | ")}
          </p>
          {extractedDetail ? <p className="mt-1 text-[11px] font-semibold text-[var(--primary)]">{extractedDetail}</p> : null}
          {document.failureReason ? <p className="mt-2 rounded-[var(--radius-sm)] bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-800">{document.failureReason}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canViewContent ? (
            <Button type="button" variant="secondary" onClick={onViewContent}>
              <Eye className="h-4 w-4" />
              View extracted content
            </Button>
          ) : null}
          {canParse ? (
            <Button type="button" variant="secondary" disabled={disabled} onClick={onParse}>
              {isParsing ? "Processing..." : document.status === "FAILED" ? "Retry" : "Parse"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OperationalDocumentContentPanel({
  document,
  query,
  onClose,
}: {
  document: TenderDocument;
  query: ReturnType<typeof useTenderDocumentContent>;
  onClose: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Extracted content</p>
          <h3 className="mt-1 text-[15px] font-semibold text-[var(--text)]">{document.name}</h3>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            {[
              document.processedAt ? `Processed ${formatTenderDate(document.processedAt)}` : null,
              document.pageCount ? `${document.pageCount} ${document.pageCount === 1 ? "page" : "pages"}` : null,
              document.contentBlocks ? `${document.contentBlocks} ${document.contentBlocks === 1 ? "block" : "blocks"}` : null,
            ]
              .filter(Boolean)
              .join(" | ")}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={onClose}>
          <X className="h-4 w-4" />
          Close
        </Button>
      </div>

      <div className="mt-4">
        {document.status === "UPLOADED" ? (
          <TendyyEmptyState title="Content not processed" description="Content is not available until this document is processed." />
        ) : document.status === "PROCESSING" ? (
          <TendyyEmptyState title="Processing document" description="Document processing is in progress." />
        ) : document.status === "FAILED" ? (
          <TendyyErrorState title="Content extraction failed" message={document.failureReason ?? "Document parser failed."} />
        ) : query.isLoading ? (
          <TendyySkeletonRows count={4} />
        ) : query.error ? (
          <TendyyErrorState title="Unable to load extracted content" message={errorText(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data?.content.length ? (
          <div className="max-h-[520px] space-y-3 overflow-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white p-3">
            {query.data.content.map((content) => (
              <article key={content.id} className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--neutral-soft)] p-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  <span>{content.pageNumber ? `Page ${content.pageNumber}` : `Block ${content.sequence}`}</span>
                  <span>{content.kind}</span>
                  {content.section ? <span className="normal-case tracking-normal">{content.section}</span> : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[var(--text)]">{content.text}</p>
              </article>
            ))}
          </div>
        ) : (
          <TendyyEmptyState title="No extracted content" description="No persisted content rows were returned for this processed document." />
        )}
      </div>
    </div>
  );
}

function OperationalRequirementRow({ tenderId, requirement }: { tenderId: string; requirement: TenderRequirement }) {
  return (
    <Link href={`/tenders/${tenderId}/requirements/${requirement.id}`} className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold text-[var(--text)]">{requirement.title}</p>
            <TendyyStatusBadge tone={requirement.mandatory ? "danger" : "neutral"}>{requirement.requirementType}</TendyyStatusBadge>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--muted)]">{requirement.description || "No description provided."}</p>
          <p className="mt-2 text-[11px] text-[var(--muted)]">{requirementProvenance(requirement)}</p>
        </div>
        <TendyyStatusBadge tone={toneFromStatus(requirement.status)}>{requirement.status}</TendyyStatusBadge>
      </div>
    </Link>
  );
}

function OperationalTimelineRow({ item }: { item: TenderTimelineItem }) {
  return (
    <div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white p-3">
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--primary)]" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[var(--text)]">{item.label}</p>
        <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">{item.summary}</p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          {[item.actorLabel, item.action, formatTenderDate(item.createdAt)].filter(Boolean).join(" | ")}
        </p>
      </div>
    </div>
  );
}

function tenderDescription(tender: WorkspaceOverview["tender"]) {
  return [tender.buyerName || tender.name, tender.referenceNumber, tender.tenderType, tender.sourceType].filter(Boolean).join(" | ");
}

function requirementProvenance(requirement: TenderRequirement) {
  const reference = requirement.sourceReference ?? {};
  const parts = ["sourceName", "documentName", "fileName", "section", "page", "pageNumber"]
    .map((key) => [key, reference[key]] as const)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim().length > 0)
    .map(([key, value]) => `${humanizeKey(key)}: ${String(value)}`);
  return parts.length ? parts.join(" | ") : "Provenance unavailable";
}

function humanizeKey(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

function formatTenderDate(value?: string | null) {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatTenderValue(value?: number | null, currency = "INR") {
  if (value === null || value === undefined) return "Not provided";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(value);
}

function deadlineTone(value?: string | null) {
  if (!value) return "neutral";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "neutral";
  const days = (time - Date.now()) / 86_400_000;
  if (days < 0) return "danger";
  if (days <= 7) return "warning";
  return "success";
}

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Something went wrong.";
}

export function RequirementsIndexClient({ tenderId, initialOverview }: RequirementsIndexClientProps) {
  const overviewQuery = useTenderWorkspace(tenderId, initialOverview ?? null);
  const requirementsQuery = useTenderRequirements(tenderId);
  const answersQuery = useTenderAnswers(tenderId);

  const tender = overviewQuery.data?.tender;
  const requirements = requirementsQuery.data?.items ?? [];
  const answers = answersQuery.data?.items ?? [];

  return (
    <AppShell
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "RFPs", href: "/tenders" },
        { label: tender?.title ?? "Tender", href: `/tenders/${tenderId}` },
        { label: "Requirements" },
      ]}
    >
      <div className="space-y-6">
        <RfpPageHeader
          eyebrow="Requirements"
          title={tender?.title ?? "Tender requirements"}
          description="Open a requirement to continue working in the AI-assisted answer workspace."
          status={tender?.status}
          statusLabel={tender?.status}
          primaryAction={{ label: "Back to tender", href: `/tenders/${tenderId}` }}
        />

        <RfpCard>
          <RfpSectionHeader
            eyebrow="Requirement list"
            title="Requirement workspace"
            description="Each row opens the canonical requirement detail page."
          />

          {requirements.length > 0 ? (
            <div className="grid gap-3">
              {requirements.map((requirement) => {
                const answer = answers.find((row) => row.questionId === requirement.questionIds[0]);
                return (
                  <Link
                    key={requirement.id}
                    href={`/tenders/${tenderId}/requirements/${requirement.id}`}
                    className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-950 group-hover:text-sky-800">{requirement.title}</p>
                          <RfpStatusBadge tone={requirement.mandatory ? "danger" : "neutral"}>
                            {requirement.requirementType}
                          </RfpStatusBadge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{requirement.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-right">
                        <RfpStatusBadge tone={answer ? reviewToneFromStatus(answer.status) : "neutral"}>
                          {answer ? answer.status : "No answer"}
                        </RfpStatusBadge>
                        <p className="text-xs text-slate-500">
                          {requirement.questionIds.length} question{requirement.questionIds.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <RfpEmptyState
              title="No requirements found"
              description="This tender does not have any requirements yet."
              actionHref={`/tenders/${tenderId}`}
              actionLabel="Back to tender"
            />
          )}
        </RfpCard>
      </div>
    </AppShell>
  );
}

export function RequirementWorkspaceClient({ tenderId, requirementId, initialOverview }: RequirementWorkspaceClientProps) {
  const overviewQuery = useTenderWorkspace(tenderId, initialOverview ?? null);
  const briefQuery = useTenderBrief(tenderId);
  const questionsQuery = useTenderQuestions(tenderId);
  const requirementsQuery = useTenderRequirements(tenderId);
  const answersQuery = useTenderAnswers(tenderId);
  const reviewsQuery = useTenderReviews(tenderId);
  const sourcesQuery = useTenderSources(tenderId);
  const generateAnswer = useGenerateAnswer(tenderId);
  const regenerateAnswer = useRegenerateAnswer(tenderId);
  const improveAnswer = useImproveAnswer(tenderId);
  const analyzeAnswer = useAnalyzeAnswer(tenderId);
  const parseSourceMutation = useParseTenderSource(tenderId);
  const saveAnswer = useSaveAnswer(tenderId);
  const submitReview = useSubmitReview(tenderId);

  const requirement = requirementsQuery.data?.items.find((item) => item.id === requirementId) ?? null;
  const question = questionsQuery.data?.items.find((item) => item.requirementIds.includes(requirementId)) ?? null;
  const currentAnswer = answersQuery.data?.items.find((item) => item.questionId === question?.id) ?? null;
  const reviews = reviewsQuery.data?.items.filter((item) => item.answerId === currentAnswer?.id) ?? [];

  const evidenceQuery = useRequirementEvidence(tenderId, requirementId);
  const answerVersionsQuery = useAnswerVersions(tenderId, currentAnswer?.id ?? null);
  const answerEvidenceQuery = useAnswerEvidence(tenderId, currentAnswer?.id ?? null);

  const [editorValue, setEditorValue] = useState(currentAnswer?.answerText ?? "");
  const [draftState, setDraftState] = useState<{
    kind: "generated" | "improved" | null;
    answer: string | null;
    generation?: AnswerGenerationPayload | null;
    improvement?: AnswerImprovementResult | null;
    analysis?: AnswerAnalysisResult | null;
    evidenceState?: "NO_EVIDENCE" | "EVIDENCE_FOUND" | null;
    grounding?: AnswerGenerationPayload["grounding"] | null;
    reason?: string | null;
    suggestedAction?: string | null;
  }>({ kind: null, answer: null });
  const [transformation, setTransformation] = useState("formal");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewStatus, setReviewStatus] = useState("APPROVED");

  useEffect(() => {
    setEditorValue(currentAnswer?.answerText ?? "");
  }, [currentAnswer?.answerText]);

  const selectedEvidenceIds = useMemo(() => {
    const generationIds = ((draftState.generation?.evidenceIds ?? []) as string[]) || [];
    const currentIds = answerEvidenceQuery.data?.items.map((row) => row.evidenceId) ?? [];
    return new Set([...generationIds, ...currentIds]);
  }, [answerEvidenceQuery.data?.items, draftState.generation?.evidenceIds]);

  const availableEvidence = evidenceQuery.data?.candidates ?? [];
  const answerVersions = answerVersionsQuery.data?.items ?? [];
  const answerEvidence = answerEvidenceQuery.data?.items ?? [];
  const sources = sourcesQuery.data?.items ?? [];
  const tender = overviewQuery.data?.tender;
  const brief = briefQuery.data?.brief;

  const useDraft = () => {
    if (draftState.answer) {
      setEditorValue(draftState.answer);
    }
  };

  const saveCurrentAnswer = async () => {
    if (!question) return;
    await saveAnswer.mutateAsync({
      questionId: question.id,
      answerId: currentAnswer?.id ?? null,
      answerText: editorValue,
      source: currentAnswer?.source ?? "MANUAL",
      confidence: currentAnswer?.confidence ?? 0.5,
      status: currentAnswer?.status ?? "DRAFT",
      metadata: currentAnswer?.metadata ?? {},
    });
  };

  const submitForReview = async () => {
    if (!currentAnswer?.id) return;
    await submitReview.mutateAsync({
      answerId: currentAnswer.id,
      status: reviewStatus,
      comment: reviewComment,
    });
    setReviewComment("");
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "RFPs", href: "/tenders" },
        { label: tender?.title ?? "Tender", href: `/tenders/${tenderId}` },
        { label: requirement?.title ?? "Requirement" },
      ]}
    >
      <div className="space-y-6">
        <RfpPageHeader
          eyebrow="Requirement workspace"
          title={requirement?.title ?? "Loading requirement"}
          description={question?.questionText ?? "Linking requirement to the matching question."}
          status={currentAnswer?.status}
          statusLabel={currentAnswer ? currentAnswer.status : "No answer yet"}
          secondaryActions={[
            {
              label: "Improve",
              onClick: () =>
                improveAnswer.mutate(
                  { requirementId, transformation },
                  {
                  onSuccess: (payload) => {
                      setDraftState({ kind: "improved", answer: payload.answer?.answerText ?? null, analysis: payload.analysis });
                    },
                  },
                ),
              loading: improveAnswer.isPending,
              variant: "secondary",
            },
            { label: "Analyze", onClick: () => analyzeAnswer.mutate(requirementId), loading: analyzeAnswer.isPending, variant: "secondary" },
            { label: "Regenerate", onClick: () => generateAnswer.mutate(requirementId), loading: regenerateAnswer.isPending, variant: "secondary" },
          ]}
          primaryAction={{
            label: "Generate Draft",
              onClick: () =>
              generateAnswer.mutate(requirementId, {
                onSuccess: (payload) => {
                  setDraftState({
                    kind: "generated",
                    answer: payload.answer?.answerText ?? null,
                    generation: payload.generation,
                    evidenceState: payload.evidenceState ?? payload.generation?.evidenceState ?? null,
                    grounding: payload.grounding ?? payload.generation?.grounding ?? null,
                    reason: payload.reason ?? null,
                    suggestedAction: payload.suggestedAction ?? null,
                  });
                },
              }),
            loading: generateAnswer.isPending,
          }}
        />

        <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <RfpCard>
            <div className="space-y-6">
              <RfpSectionHeader eyebrow="Question" title={question?.questionText ?? "No question linked"} />
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone="neutral">{requirement?.requirementType ?? "Requirement"}</StatusPill>
                  <StatusPill tone={currentAnswer ? reviewToneFromStatus(currentAnswer.status) : "neutral"}>
                    {currentAnswer ? currentAnswer.status : "No answer yet"}
                  </StatusPill>
                  <StatusPill tone="neutral">{requirement?.mandatory ? "Mandatory" : "Optional"}</StatusPill>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{requirement?.description ?? "Loading requirement details."}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3">
                  <RfpSectionHeader eyebrow="Current answer" title="Editable working draft" />
                  <textarea
                    value={editorValue}
                    onChange={(event) => setEditorValue(event.target.value)}
                    rows={12}
                    className="min-h-[260px] w-full rounded-[10px] border border-slate-300 bg-white p-4 text-sm leading-6 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    placeholder="Write or refine the answer here."
                  />
                  <div className="flex flex-wrap gap-3">
                    <ActionButton onClick={saveCurrentAnswer} loading={saveAnswer.isPending}>
                      Save
                    </ActionButton>
                    <ActionButton variant="secondary" onClick={useDraft} disabled={!draftState.answer}>
                      Use Draft
                    </ActionButton>
                    <ActionButton variant="secondary" onClick={submitForReview} loading={submitReview.isPending} disabled={!currentAnswer?.id}>
                      Submit for Review
                    </ActionButton>
                  </div>
                  {currentAnswer?.status === "APPROVED" || currentAnswer?.status === "FINAL" ? (
                    <p className="text-sm text-slate-600">Approved answers are shown as locked in the UI so they are not silently overwritten.</p>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <RfpSectionHeader eyebrow="AI assistant" title="Draft controls" />
                  <div className="space-y-3 rounded-[10px] border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-sm font-medium text-slate-700">
                      Improve style
                      <select
                        value={transformation}
                        onChange={(event) => setTransformation(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="formal">Formal</option>
                        <option value="concise">Concise</option>
                        <option value="improve">Improve clarity</option>
                        <option value="shorten">Shorten</option>
                        <option value="expand">Expand</option>
                        <option value="align_to_evidence">Align to evidence</option>
                      </select>
                    </label>
                    <p className="text-sm leading-6 text-slate-600">AI actions generate or suggest drafts only. They do not approve or submit anything.</p>
                  </div>

                  {draftState.answer ? (
                    <DraftCard
                      title={draftState.kind === "improved" ? "Improvement proposal" : "Generated draft"}
                      answer={draftState.answer}
                      generation={draftState.generation}
                      evidenceState={draftState.evidenceState}
                      grounding={draftState.grounding}
                      reason={draftState.reason}
                      suggestedAction={draftState.suggestedAction}
                    />
                  ) : (
                    <PanelState label="No AI draft yet" />
                  )}
                </div>
              </div>
            </div>
          </RfpCard>

          <div className="space-y-6">
            <RfpCard>
              <RfpSectionHeader eyebrow="Sources" title="Tender source parse state" />
              {sourcesQuery.error ? (
                <ErrorBanner error={sourcesQuery.error} />
              ) : sources.length > 0 ? (
                <div className="space-y-3">
                  {sources.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      isParsing={parseSourceMutation.isPending && parseSourceMutation.variables === source.id}
                      disabled={parseSourceMutation.isPending && parseSourceMutation.variables !== source.id}
                      onParse={() => parseSourceMutation.mutate(source.id)}
                    />
                  ))}
                </div>
              ) : (
                <PanelState label="No tender sources yet" />
              )}
              {parseSourceMutation.error ? <ErrorBanner error={parseSourceMutation.error} /> : null}
            </RfpCard>

            <RfpCard>
              <RfpSectionHeader eyebrow="Evidence" title="Available vs used evidence" />
              {evidenceQuery.error ? (
                <ErrorBanner error={evidenceQuery.error} />
              ) : (
                <div className="space-y-3">
                  <EvidenceBlock title="Used in this draft" items={availableEvidence.filter((item) => selectedEvidenceIds.has(item.evidenceId))} used />
                  <EvidenceBlock title="Available evidence" items={availableEvidence} used={false} />
                </div>
              )}
            </RfpCard>

            <RfpCard>
              <RfpSectionHeader eyebrow="Analysis" title="Readiness and risk" />
              {analyzeAnswer.data?.analysis ? (
                <AnalysisPanel analysis={analyzeAnswer.data.analysis} />
              ) : draftState.analysis ? (
                <AnalysisPanel analysis={draftState.analysis} />
              ) : (
                <PanelState label="Run Analyze to inspect risk and coverage." />
              )}
            </RfpCard>

            <RfpCard>
              <RfpSectionHeader eyebrow="History" title="Answer versions" />
              <VersionList versions={answerVersions} currentAnswer={currentAnswer} />
            </RfpCard>

            <RfpCard>
              <RfpSectionHeader eyebrow="Review" title="Human review state" />
              <div className="space-y-3">
                {reviews.length > 0 ? (
                  reviews.map((review) => (
                    <div key={review.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-slate-900">{review.status}</p>
                        <StatusPill tone={reviewToneFromStatus(review.status)}>{review.status}</StatusPill>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{review.comment}</p>
                    </div>
                  ))
                ) : (
                  <PanelState label="No reviews yet" />
                )}

                <label className="block text-sm font-medium text-slate-700">
                  Review status
                  <select
                    value={reviewStatus}
                    onChange={(event) => setReviewStatus(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="APPROVED">Approve</option>
                    <option value="CHANGES_REQUESTED">Request changes</option>
                    <option value="REJECTED">Reject</option>
                    <option value="PENDING">Pending</option>
                  </select>
                </label>
                <textarea
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  placeholder="Reviewer notes"
                />
              </div>
            </RfpCard>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <RfpCard>
            <RfpSectionHeader eyebrow="Tender brief" title="Brief and risk context" />
            {brief ? <TenderBriefPanel brief={brief} sections={briefQuery.data?.sections ?? []} /> : <PanelState label="Loading brief" />}
          </RfpCard>

          <RfpCard>
            <RfpSectionHeader eyebrow="Activity" title="Available workspace context" />
            <div className="grid gap-3 text-sm">
              <InfoRow label="Tender" value={tender?.title ?? "Loading"} />
              <InfoRow label="Requirement" value={requirement?.title ?? requirementId} />
              <InfoRow label="Question" value={question?.questionText ?? "Loading"} />
              <InfoRow label="Answer versions" value={String(answerVersions.length)} />
              <InfoRow label="Evidence rows" value={String(answerEvidence.length)} />
            </div>
          </RfpCard>
        </section>
      </div>
    </AppShell>
  );
}

function TenderBriefPanel({ brief, sections }: { brief: TenderBriefPayload["brief"]; sections: TenderBriefPayload["sections"] }) {
  return (
    <div className="space-y-5">
      <p className="max-w-4xl text-sm leading-6 text-slate-600">{brief.overview}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailList title="Key Requirements" items={brief.keyRequirements} />
        <DetailList title="Required Documents" items={brief.documents.map((doc) => `${doc.name} | ${doc.role}`)} />
        <DetailList title="Important Dates" items={brief.dates.map((date) => `${date.label}: ${date.value ?? "Not set"}`)} />
        <DetailList title="Clarifications" items={brief.clarifications} />
      </div>
      <DetailList title="Risk Items" items={brief.risks} />
      <DetailList title="Missing Information" items={brief.missingInformation} />
      <div className="grid gap-3 sm:grid-cols-3">
        {sections.map((section) => (
          <div key={section.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">{section.label}</p>
            <p className="mt-1 text-[19px] font-semibold text-slate-950">{section.items}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-2.5 space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item} className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
              {item}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Nothing to show yet.</p>
        )}
      </div>
    </div>
  );
}

function DraftCard({
  title,
  answer,
  generation,
  evidenceState,
  grounding,
  reason,
  suggestedAction,
}: {
  title: string;
  answer: string;
  generation?: AnswerGenerationPayload | null;
  evidenceState?: "NO_EVIDENCE" | "EVIDENCE_FOUND" | null;
  grounding?: AnswerGenerationPayload["grounding"] | null;
  reason?: string | null;
  suggestedAction?: string | null;
}) {
  return (
    <RfpAnswerCard
      question={title}
      answer={<span className="whitespace-pre-wrap">{answer}</span>}
      evidence={
        generation ? (
          <div className="space-y-2">
            <InfoRow label="Generated at" value={String(getGenerationMeta(generation)?.generatedAt ?? "Now")} />
            <InfoRow label="Generation ID" value={String(getGenerationMeta(generation)?.generationId ?? "n/a")} />
            <InfoRow label="Evidence state" value={evidenceState ?? generation.evidenceState ?? "EVIDENCE_FOUND"} />
            {grounding ? <InfoRow label="Grounding" value={grounding.status} /> : null}
            {typeof grounding?.coverage === "number" ? <InfoRow label="Coverage" value={`${Math.round(grounding.coverage * 100)}%`} /> : null}
            {reason ? <InfoRow label="Review reason" value={reason} /> : null}
            {suggestedAction ? <InfoRow label="Suggested action" value={suggestedAction} /> : null}
          </div>
        ) : undefined
      }
      actions={generation ? <RfpStatusBadge tone="warning">{generation.status}</RfpStatusBadge> : undefined}
    />
  );
}

function EvidenceBlock({ title, items, used }: { title: string; items: EvidenceCandidate[]; used: boolean }) {
  return (
            <RfpReviewPanel title={title}>
      <div className="space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <RfpEvidenceCard
              key={item.evidenceId}
              title={item.title}
              description={item.snippet}
              sourceType={item.evidenceType}
              version={item.sourceVersion}
              freshness={item.freshness}
              relevance={item.relevanceScore}
              confidence={item.authorityScore}
              ownerId={item.ownerId ?? null}
              verifiedAt={item.verifiedAt ?? null}
              used={used}
            />
          ))
        ) : (
          <p className="text-sm text-slate-500">No authoritative evidence found.</p>
        )}
      </div>
    </RfpReviewPanel>
  );
}

function AnalysisPanel({ analysis }: { analysis: AnswerAnalysisResult }) {
  if (!analysis) {
    return null;
  }
  return (
    <RfpReviewPanel title="Readiness">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-600">Readiness</p>
          <RfpStatusBadge tone={analysis.readiness === "READY" ? "success" : analysis.risk === "CRITICAL" ? "danger" : "warning"}>
            {analysis.readiness}
          </RfpStatusBadge>
        </div>
        <div className="grid gap-2 text-sm text-slate-700">
          <InfoRow label="Risk" value={analysis.risk} />
          {typeof analysis.coverage === "number" ? <InfoRow label="Coverage" value={`${Math.round(analysis.coverage * 100)}%`} /> : null}
        </div>
      </div>
      {Array.isArray(analysis.warnings) && analysis.warnings.length > 0 ? (
        <DetailList title="Warnings" items={analysis.warnings} />
      ) : null}
      {Array.isArray(analysis.missingEvidence) && analysis.missingEvidence.length > 0 ? (
        <DetailList title="Missing evidence" items={analysis.missingEvidence} />
      ) : null}
      {Array.isArray(analysis.contradictions) && analysis.contradictions.length > 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Contradictions</p>
          <div className="mt-3 space-y-2">
            {(analysis.contradictions as Array<{ claim: string; reason: string }>).map((item) => (
            <div key={`${item.claim}-${item.reason}`} className="rounded-[8px] bg-white p-3 text-[13px] text-slate-700 shadow-sm">
                <p className="font-medium text-slate-900">{item.claim}</p>
                <p className="mt-1">{item.reason}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {Array.isArray(analysis.claims) && analysis.claims.length > 0 ? (
        <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-500">Claims</p>
          <div className="mt-2.5 space-y-2">
            {(analysis.claims as Array<{ claim: string; reason: string }>).map((item) => (
            <div key={`${item.claim}-${item.reason}`} className="rounded-[8px] bg-white p-3 text-[13px] text-slate-700 shadow-sm">
                <p className="font-medium text-slate-900">{item.claim}</p>
                <p className="mt-1">{item.reason}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </RfpReviewPanel>
  );
}

function VersionList({ versions, currentAnswer }: { versions: TenderAnswerVersion[]; currentAnswer: TenderAnswer | null }) {
  return (
    <div className="space-y-3">
      {versions.length > 0 ? (
        versions.map((version) => {
          const isCurrent = getGenerationId(currentAnswer?.metadata) === getGenerationId(version.metadata);
          return (
            <div key={version.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">Version {version.versionNumber}</p>
                  <p className="text-xs text-slate-500">{version.source}</p>
                </div>
                {isCurrent ? <RfpStatusBadge tone="success">Current</RfpStatusBadge> : <RfpStatusBadge tone="neutral">History</RfpStatusBadge>}
              </div>
              <p className="mt-2 text-sm text-slate-600">{new Date(version.createdAt).toLocaleString()}</p>
              <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-700">{version.content}</p>
            </div>
          );
        })
      ) : (
        <PanelState label="No answer versions yet" />
      )}
    </div>
  );
}

function PanelState({ label }: { label: string }) {
  return <RfpEmptyState title={label} description="Nothing has been added to this section yet." />;
}

function ErrorBanner({ error }: { error: unknown }) {
  const message = error instanceof ApiError ? error.message : "Something went wrong";
  const code = error instanceof ApiError ? error.code : "";
  return <RfpErrorState message={message} code={code} />;
}

function StatusPill({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: React.ReactNode }) {
  return <RfpStatusBadge tone={tone}>{children}</RfpStatusBadge>;
}

function sourceStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  const normalized = status.trim().toUpperCase();
  if (normalized === "READY" || normalized === "ACTIVE") return "success";
  if (normalized === "PENDING" || normalized === "PROCESSING" || normalized === "UPLOADING") return "warning";
  if (normalized === "REMOVED" || normalized === "FAILED") return "danger";
  return "neutral";
}

function sourceParseTone(parseStatus: TenderSource["parseStatus"]): "success" | "warning" | "danger" | "neutral" {
  if (parseStatus === "PARSED") return "success";
  if (parseStatus === "UPLOADED" || parseStatus === "REGISTERED") return "warning";
  if (parseStatus === "REMOVED") return "danger";
  return "neutral";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function SourceCard({
  source,
  isParsing,
  disabled,
  onParse,
}: {
  source: TenderSource;
  isParsing: boolean;
  disabled: boolean;
  onParse: () => void;
}) {
  const canParse = source.status === "READY" && source.parseStatus !== "PARSED";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{source.name}</p>
            <StatusPill tone={sourceStatusTone(source.status)}>{source.status}</StatusPill>
            <StatusPill tone={sourceParseTone(source.parseStatus)}>{`Parse ${source.parseStatus}`}</StatusPill>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <InfoRow label="Source type" value={source.sourceType} />
            <InfoRow label="File size" value={formatBytes(source.fileSize)} />
            <InfoRow label="Mime type" value={source.mimeType ?? "Unknown"} />
            <InfoRow label="Parsed at" value={source.parsedAt ? new Date(source.parsedAt).toLocaleString() : "Not parsed"} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <ActionButton onClick={onParse} loading={isParsing} variant="secondary" disabled={!canParse || isParsing || disabled}>
            {source.parseStatus === "PARSED" ? "Parsed" : canParse ? "Parse source" : "Upload first"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
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
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}
