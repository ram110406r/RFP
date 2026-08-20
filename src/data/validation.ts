import type { ValidationCategory, ValidationIssue } from "@/types";
import { getRfp } from "./rfps";
import { getRequirementsForRfp } from "./requirements";

export interface ValidationSnapshot {
  score: number;
  categories: ValidationCategory[];
  issues: ValidationIssue[];
}

function buildCategories(rfpId: string): ValidationCategory[] {
  const rfp = getRfp(rfpId);
  const reqs = getRequirementsForRfp(rfpId);
  if (!rfp) return [];

  const highRiskOrAbove = reqs.filter((r) => r.risk === "high" || r.risk === "critical");
  const highRiskResolved = highRiskOrAbove.filter((r) => r.status === "approved").length;
  const evidenceBacked = reqs.filter((r) => r.evidenceIds.length > 0).length;
  const legalReqs = reqs.filter((r) => r.category === "Legal");
  const legalApproved = legalReqs.filter((r) => r.status === "approved").length;
  const commercialReqs = reqs.filter((r) => r.category === "Commercial");
  const commercialApproved = commercialReqs.filter((r) => r.status === "approved").length;
  const outstanding = reqs.filter(
    (r) => r.status === "needs_review" || r.status === "changes_requested",
  ).length;

  return [
    {
      id: "mandatory",
      label: "Mandatory requirements answered",
      value: rfp.mandatoryComplete,
      total: rfp.mandatoryTotal,
      tone:
        rfp.mandatoryComplete === rfp.mandatoryTotal
          ? "success"
          : rfp.mandatoryComplete / Math.max(rfp.mandatoryTotal, 1) < 0.6
            ? "danger"
            : "warning",
      hint: "Mandatory questions must be approved before this RFP can be marked ready.",
    },
    {
      id: "risk",
      label: "High & critical risk resolved",
      value: highRiskResolved,
      total: highRiskOrAbove.length,
      tone:
        highRiskOrAbove.length === 0
          ? "success"
          : highRiskResolved === highRiskOrAbove.length
            ? "success"
            : "danger",
      hint: "High and critical risk answers need evidence or reviewer sign-off before submission.",
    },
    {
      id: "evidence",
      label: "Answers backed by evidence",
      value: evidenceBacked,
      total: reqs.length,
      tone: evidenceBacked / Math.max(reqs.length, 1) > 0.85 ? "success" : "warning",
      hint: "Answers without linked evidence carry higher review risk.",
    },
    {
      id: "reviews",
      label: "Reviews outstanding",
      value: outstanding,
      total: reqs.length,
      tone: outstanding === 0 ? "success" : outstanding > 6 ? "danger" : "warning",
      hint: "Requirements still in review or with requested changes.",
    },
    {
      id: "legal",
      label: "Legal clauses approved",
      value: legalApproved,
      total: legalReqs.length,
      tone: legalApproved === legalReqs.length ? "success" : "warning",
      hint: "Legal terms must be signed off before the package is generated.",
    },
    {
      id: "commercial",
      label: "Commercial terms approved",
      value: commercialApproved,
      total: commercialReqs.length,
      tone: commercialApproved === commercialReqs.length ? "success" : "neutral",
      hint: "Pricing and commercial terms confirmed against the current playbook.",
    },
  ];
}

const issuesByRfp: Record<string, ValidationIssue[]> = {
  "rfp-1": [
    {
      id: "iss1",
      severity: "critical",
      issue: "Incident response answer has no supporting evidence",
      requirementCode: "MH-SEC-05",
      reason: "Customer notification SLA is not documented in any linked knowledge source.",
      action: "Source the exact notification SLA from the master security addendum and re-verify.",
    },
    {
      id: "iss2",
      severity: "high",
      issue: "Vulnerability management answer under-sourced",
      requirementCode: "MH-SEC-04",
      reason: "Remediation SLA figures are not backed by a current, verifiable source.",
      action: "Attach a vulnerability management policy document and regenerate the draft.",
    },
    {
      id: "iss3",
      severity: "high",
      issue: "HIPAA compliance posture lacks direct evidence",
      requirementCode: "MH-CMP-01",
      reason: "No dedicated HIPAA control mapping or BAA reference exists in the knowledge base.",
      action: "Request a HIPAA control mapping document from Compliance before approval.",
    },
    {
      id: "iss4",
      severity: "high",
      issue: "Support SLA answer sourced from a stale document",
      requirementCode: "MH-SUP-01",
      reason: "Support SLA Policy was last verified 289 days ago and is flagged stale.",
      action: "Request a refreshed Support SLA Policy from Knowledge Ops.",
    },
    {
      id: "iss5",
      severity: "medium",
      issue: "Deployment model answer conflicts with a reused source",
      requirementCode: "MH-PRD-01",
      reason:
        "A low-authority prior RFP answer claims single-tenant deployment, contradicting current architecture.",
      action:
        "Cite the Product Architecture Whitepaper explicitly and remove the conflicting reference.",
    },
    {
      id: "iss6",
      severity: "medium",
      issue: "Termination clause pending legal confirmation",
      requirementCode: "MH-LGL-02",
      reason:
        "90-day termination for convenience term has not been confirmed against the current legal playbook.",
      action: "Route to Elena Fischer for final legal confirmation.",
    },
    {
      id: "iss7",
      severity: "low",
      issue: "Accessibility conformance question unanswered",
      requirementCode: "MH-PRD-05",
      reason: "No WCAG conformance report is available to cite.",
      action: "Assign to Product to draft a conformance statement or commission an audit.",
    },
  ],
  "rfp-2": [
    {
      id: "iss8",
      severity: "high",
      issue: "Freight liability clause needs legal language",
      requirementCode: "GX-LGL-01",
      reason: "Standard legal playbook does not address freight loss carve-outs.",
      action: "Draft precise carve-out language with Legal before approval.",
    },
    {
      id: "iss9",
      severity: "high",
      issue: "Customs compliance answer lacks a source",
      requirementCode: "GX-CMP-01",
      reason: "No knowledge source addresses cross-border trade compliance recordkeeping.",
      action:
        "Open a knowledge gap ticket with Compliance for a trade compliance reference document.",
    },
    {
      id: "iss10",
      severity: "medium",
      issue: "Partner network segmentation under-evidenced",
      requirementCode: "GX-SEC-02",
      reason:
        "Drafted from a general access-control claim rather than a segmentation-specific control.",
      action: "Attach network architecture documentation describing partner segmentation.",
    },
    {
      id: "iss11",
      severity: "low",
      issue: "Early termination fee position undecided",
      requirementCode: "GX-COM-03",
      reason: "Not addressed in the standard commercial playbook.",
      action: "Escalate to Commercial for a fallback position.",
    },
  ],
  "rfp-3": [
    {
      id: "iss12",
      severity: "critical",
      issue: "CCPA compliance question unanswered",
      requirementCode: "NW-CMP-01",
      reason: "Mandatory privacy law question has not been drafted yet.",
      action: "Assign to Compliance immediately — due before other mandatory items.",
    },
    {
      id: "iss13",
      severity: "high",
      issue: "PII tokenization answer under-sourced",
      requirementCode: "NW-SEC-01",
      reason: "No dedicated tokenization control document exists in the knowledge base.",
      action: "Request a tokenization / data masking control document from Security.",
    },
    {
      id: "iss14",
      severity: "medium",
      issue: "Identity resolution accuracy benchmark is outdated",
      requirementCode: "NW-PRD-01",
      reason:
        "Cited match precision figure is from an older internal source pending re-validation.",
      action: "Re-run the benchmark and update the cited figure.",
    },
  ],
};

export function getValidationSnapshot(rfpId: string): ValidationSnapshot {
  const categories = buildCategories(rfpId);
  const issues = issuesByRfp[rfpId] ?? [];
  const rfp = getRfp(rfpId);
  return { score: rfp?.readiness ?? 0, categories, issues };
}
