"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@rfp-os/ui";

import { AppShell } from "./app-shell";
import {
  RfpAnswerCard,
  RfpCard,
  RfpEmptyState,
  RfpErrorState,
  RfpEvidenceCard,
  RfpMetricCard,
  RfpPageHeader,
  RfpReviewPanel,
  RfpSectionHeader,
  RfpStatusBadge,
} from "./rfp-foundation";
import { ApiError } from "../lib/api";
import type { AnswerAnalysisResult, AnswerImprovementResult } from "@rfp-os/types";
import type {
  AnswerGenerationPayload,
  EvidenceCandidate,
  TenderBriefPayload,
  TenderAnswer,
  TenderAnswerVersion,
  TenderSource,
  WorkspaceOverview,
} from "../lib/models";
import {
  useAnalyzeAnswer,
  useAnalyzeTenderMutation,
  useAnswerEvidence,
  useAnswerVersions,
  useGenerateAnswer,
  useImproveAnswer,
  useRegenerateAnswer,
  useRequirementEvidence,
  useSaveAnswer,
  useSubmitReview,
  useTenderAnswers,
  useTenderBrief,
  useTenderBriefRefresh,
  useTenderQuestions,
  useTenderRequirements,
  useTenderReviews,
  useTenderSources,
  useParseTenderSource,
  useTenderWorkspace,
} from "../lib/queries";
import { getGenerationId, getGenerationMeta, reviewToneFromStatus } from "../lib/workspace-utils";

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
  const briefQuery = useTenderBrief(tenderId);
  const questionsQuery = useTenderQuestions(tenderId);
  const requirementsQuery = useTenderRequirements(tenderId);
  const answersQuery = useTenderAnswers(tenderId);
  const reviewsQuery = useTenderReviews(tenderId);
  const sourcesQuery = useTenderSources(tenderId);
  const refreshBrief = useTenderBriefRefresh(tenderId);
  const analyzeTenderMutation = useAnalyzeTenderMutation(tenderId);
  const parseSourceMutation = useParseTenderSource(tenderId);

  const tender = overviewQuery.data?.tender;
  const requirements = requirementsQuery.data?.items ?? [];
  const questions = questionsQuery.data?.items ?? [];
  const answers = answersQuery.data?.items ?? [];
  const reviews = reviewsQuery.data?.items ?? [];
  const sources = sourcesQuery.data?.items ?? [];
  const brief = briefQuery.data?.brief;
  const validation = overviewQuery.data?.validation.current;
  const briefSections = briefQuery.data?.sections ?? [];

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "RFPs", href: "/tenders" }, { label: tender?.title ?? "Tender" }]}>
      <div className="space-y-6">
        <header className="rounded-[10px] border border-[rgba(72,52,31,0.12)] bg-white/85 p-4 shadow-[0_16px_45px_rgba(62,42,23,0.12)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-900/80">Tender workspace</p>
              <h1 className="text-[29px] font-semibold tracking-tight sm:text-[30px]">{tender?.title ?? "Loading tender workspace"}</h1>
              <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-600">
                {tender
                  ? `${tender.name} | ${tender.tenderType} | ${tender.status} | Workspace ${tender.workspaceId}`
                  : "Fetching workspace data from the backend."}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <ActionButton
                onClick={() => refreshBrief.mutate()}
                loading={refreshBrief.isPending}
                variant="secondary"
              >
                Refresh Brief
              </ActionButton>
              <ActionButton
                onClick={() => analyzeTenderMutation.mutate()}
                loading={analyzeTenderMutation.isPending}
              >
                Analyze Tender
              </ActionButton>
            </div>
          </div>

          {overviewQuery.error ? <ErrorBanner error={overviewQuery.error} /> : null}
        </header>

        <section className="grid gap-4 lg:grid-cols-4">
          <MetricCard label="Questions" value={overviewQuery.data?.counts.questions ?? questions.length} />
          <MetricCard label="Requirements" value={overviewQuery.data?.counts.requirements ?? requirements.length} />
          <MetricCard label="Answers" value={overviewQuery.data?.counts.answers ?? answers.length} />
          <MetricCard label="Reviews" value={overviewQuery.data?.counts.reviews ?? reviews.length} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <article className="rounded-[10px] border border-[rgba(72,52,31,0.12)] bg-white/90 p-4 shadow-[0_16px_45px_rgba(62,42,23,0.12)]">
            <SectionTitle
              eyebrow="Tender brief"
              title="Evidence-aware briefing for contributors"
              subtitle="The brief is grounded in the live tender, requirements, questions, and source set."
            />

            {brief ? <TenderBriefPanel brief={brief} sections={briefSections} /> : <PanelState label="Loading brief" />}
          </article>

          <article className="rounded-[10px] border border-[rgba(72,52,31,0.12)] bg-white/90 p-4 shadow-[0_16px_45px_rgba(62,42,23,0.12)]">
            <SectionTitle
              eyebrow="Validation"
              title="Workspace readiness"
              subtitle="Deterministic validation is computed from the current tender data."
            />

            {validation ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-emerald-900">Current score</p>
                      <p className="mt-1 text-[30px] font-semibold text-emerald-950">{validation.score}</p>
                    </div>
                    <StatusPill tone={validation.ready ? "success" : "warning"}>
                      {validation.ready ? "Ready" : "Needs work"}
                    </StatusPill>
                  </div>
                </div>

                <div className="space-y-3">
                  {validation.issues.slice(0, 4).map((issue) => (
                    <div key={issue.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900">{issue.title}</p>
                        <StatusPill tone={issue.severity === "CRITICAL" || issue.severity === "HIGH" ? "danger" : "warning"}>
                          {issue.severity}
                        </StatusPill>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{issue.recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <PanelState label="Loading validation" />
            )}
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <article className="rounded-[10px] border border-[rgba(72,52,31,0.12)] bg-white/90 p-4 shadow-[0_16px_45px_rgba(62,42,23,0.12)]">
            <SectionTitle
              eyebrow="Requirements"
              title="Question and requirement map"
              subtitle="Click a requirement to open the AI-assisted answer workspace."
            />

            <div className="grid gap-3">
              {requirements.map((requirement) => {
                const questionCount = requirement.questionIds.length;
                const answer = answers.find((row) => row.questionId === requirement.questionIds[0]);
                return (
                  <Link
                    key={requirement.id}
                    href={`/tenders/${tenderId}/requirements/${requirement.id}`}
                    className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-900">{requirement.title}</p>
                          <StatusPill tone={requirement.mandatory ? "danger" : "neutral"}>
                            {requirement.requirementType}
                          </StatusPill>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{requirement.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-right">
                        <StatusPill tone={answer ? reviewToneFromStatus(answer.status) : "neutral"}>
                          {answer ? answer.status : "No answer"}
                        </StatusPill>
                        <p className="text-xs text-slate-500">
                          {questionCount} question{questionCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </article>

          <article className="rounded-[10px] border border-[rgba(72,52,31,0.12)] bg-white/90 p-4 shadow-[0_16px_45px_rgba(62,42,23,0.12)]">
            <SectionTitle
              eyebrow="Sources"
              title="Tender sources and parse state"
              subtitle="This panel shows the live source pack, its ingest state, and whether parsing has completed."
            />

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {overviewQuery.data?.sections.map((section) => (
                  <div key={section.id} className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-[13px] font-medium text-slate-900">{section.label}</p>
                    <p className="text-xs text-slate-500">{section.id}</p>
                    <p className="mt-1.5 text-[19px] font-semibold text-slate-900">{section.items}</p>
                  </div>
                ))}
              </div>

              {sourcesQuery.error ? <ErrorBanner error={sourcesQuery.error} /> : null}

              {sources.length > 0 ? (
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
            </div>

            {briefQuery.error ? <ErrorBanner error={briefQuery.error} /> : null}
            {analyzeTenderMutation.error ? <ErrorBanner error={analyzeTenderMutation.error} /> : null}
            {parseSourceMutation.error ? <ErrorBanner error={parseSourceMutation.error} /> : null}
          </article>
        </section>
      </div>
    </AppShell>
  );
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

function MetricCard({ label, value }: { label: string; value: number }) {
  return <RfpMetricCard label={label} value={value} />;
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <RfpSectionHeader eyebrow={eyebrow} title={title} description={subtitle} />;
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
