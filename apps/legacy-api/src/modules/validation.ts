import { Elysia } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { rfpAnswers, rfpEvidence, rfpRequirements } from "../db/schema";
import { requireAuth } from "../lib/auth";
import { getRfpOr404 } from "./rfps";

type Severity = "critical" | "high" | "medium" | "low";
type Tone = "neutral" | "success" | "warning" | "danger";

function severityForRisk(risk: string): Severity {
  if (risk === "critical") return "critical";
  if (risk === "high") return "high";
  return "medium";
}

/**
 * Rule-based, derived entirely from this RFP's real requirement rows — no
 * hand-authored issue text. Each rule below maps a real data condition to a
 * concrete, actionable issue.
 */
async function buildIssues(rfpId: string) {
  const requirements = await db
    .select()
    .from(rfpRequirements)
    .where(eq(rfpRequirements.rfpId, rfpId));
  const issues: {
    id: string;
    severity: Severity;
    issue: string;
    requirementCode: string;
    reason: string;
    action: string;
  }[] = [];

  for (const req of requirements) {
    if (req.mandatory && req.status !== "approved") {
      issues.push({
        id: `${req.id}-mandatory`,
        severity: severityForRisk(req.risk),
        issue: `${req.title} is not yet approved`,
        requirementCode: req.code,
        reason: "This is a mandatory requirement and must be approved before submission.",
        action: "Complete drafting, resolve any review feedback, and get this approved.",
      });
    }

    if (req.risk === "high" || req.risk === "critical") {
      const answer = await db
        .select({ id: rfpAnswers.id })
        .from(rfpAnswers)
        .where(and(eq(rfpAnswers.requirementId, req.id), eq(rfpAnswers.isCurrent, true)))
        .limit(1);
      const evidenceCount = answer[0]
        ? (
            await db
              .select({ id: rfpEvidence.id })
              .from(rfpEvidence)
              .where(eq(rfpEvidence.answerId, answer[0].id))
          ).length
        : 0;
      if (evidenceCount === 0) {
        issues.push({
          id: `${req.id}-evidence`,
          severity: req.risk === "critical" ? "critical" : "high",
          issue: `${req.risk === "critical" ? "Critical" : "High"} risk answer has no supporting evidence`,
          requirementCode: req.code,
          reason: `${req.riskRationale || "This answer carries elevated risk"} and is not backed by any linked knowledge source.`,
          action: "Link a verified evidence source or route this to a reviewer before submission.",
        });
      }
    }

    if (req.status === "needs_review" || req.status === "changes_requested") {
      issues.push({
        id: `${req.id}-review`,
        severity: req.status === "changes_requested" ? "medium" : "low",
        issue: `${req.title} is awaiting ${req.status === "changes_requested" ? "requested changes" : "review"}`,
        requirementCode: req.code,
        reason: "This requirement has not completed the review cycle yet.",
        action: "Follow up with the assigned reviewer to move this forward.",
      });
    }
  }

  return issues;
}

async function buildCategories(rfpId: string, organizationId: string) {
  const rfp = await getRfpOr404(rfpId, organizationId);
  const requirements = await db
    .select()
    .from(rfpRequirements)
    .where(eq(rfpRequirements.rfpId, rfpId));

  const highRiskOrAbove = requirements.filter((r) => r.risk === "high" || r.risk === "critical");
  const highRiskResolved = highRiskOrAbove.filter((r) => r.status === "approved").length;
  let evidenceBacked = 0;
  for (const r of requirements) {
    const answer = await db
      .select({ id: rfpAnswers.id })
      .from(rfpAnswers)
      .where(and(eq(rfpAnswers.requirementId, r.id), eq(rfpAnswers.isCurrent, true)))
      .limit(1);
    if (!answer[0]) continue;
    const evidence = await db
      .select({ id: rfpEvidence.id })
      .from(rfpEvidence)
      .where(eq(rfpEvidence.answerId, answer[0].id));
    if (evidence.length > 0) evidenceBacked += 1;
  }
  const legalReqs = requirements.filter((r) => r.category === "Legal");
  const legalApproved = legalReqs.filter((r) => r.status === "approved").length;
  const commercialReqs = requirements.filter((r) => r.category === "Commercial");
  const commercialApproved = commercialReqs.filter((r) => r.status === "approved").length;
  const outstanding = requirements.filter(
    (r) => r.status === "needs_review" || r.status === "changes_requested",
  ).length;

  const cat = (
    id: string,
    label: string,
    value: number,
    total: number | null,
    tone: Tone,
    hint: string,
  ) => ({ id, label, value, total, tone, hint });

  return [
    cat(
      "mandatory",
      "Mandatory requirements answered",
      rfp.mandatoryComplete,
      rfp.mandatoryTotal,
      rfp.mandatoryComplete === rfp.mandatoryTotal
        ? "success"
        : rfp.mandatoryComplete / Math.max(rfp.mandatoryTotal, 1) < 0.6
          ? "danger"
          : "warning",
      "Mandatory questions must be approved before this RFP can be marked ready.",
    ),
    cat(
      "risk",
      "High & critical risk resolved",
      highRiskResolved,
      highRiskOrAbove.length,
      highRiskOrAbove.length === 0 || highRiskResolved === highRiskOrAbove.length
        ? "success"
        : "danger",
      "High and critical risk answers need evidence or reviewer sign-off before submission.",
    ),
    cat(
      "evidence",
      "Answers backed by evidence",
      evidenceBacked,
      requirements.length,
      evidenceBacked / Math.max(requirements.length, 1) > 0.85 ? "success" : "warning",
      "Answers without linked evidence carry higher review risk.",
    ),
    cat(
      "reviews",
      "Reviews outstanding",
      outstanding,
      requirements.length,
      outstanding === 0 ? "success" : outstanding > 6 ? "danger" : "warning",
      "Requirements still in review or with requested changes.",
    ),
    cat(
      "legal",
      "Legal clauses approved",
      legalApproved,
      legalReqs.length,
      legalApproved === legalReqs.length ? "success" : "warning",
      "Legal terms must be signed off before the package is generated.",
    ),
    cat(
      "commercial",
      "Commercial terms approved",
      commercialApproved,
      commercialReqs.length,
      commercialApproved === commercialReqs.length ? "success" : "neutral",
      "Pricing and commercial terms confirmed against the current playbook.",
    ),
  ];
}

export const validationModule = new Elysia().post(
  "/api/rfps/:id/validate",
  async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    const rfp = await getRfpOr404(params.id, auth.organizationId);
    const [categories, issues] = await Promise.all([
      buildCategories(params.id, auth.organizationId),
      buildIssues(params.id),
    ]);
    return { score: rfp.readiness, categories, issues };
  },
);
