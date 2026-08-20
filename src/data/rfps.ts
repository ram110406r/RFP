import type { Rfp, RiskLevel } from "@/types";
import { getRequirementsForRfp } from "./requirements";

function riskCounts(rfpId: string): Record<RiskLevel, number> {
  const reqs = getRequirementsForRfp(rfpId);
  const counts: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of reqs) counts[r.risk] += 1;
  return counts;
}

export function computeFromRequirements(
  rfpId: string,
): Pick<
  Rfp,
  | "requirementsTotal"
  | "requirementsComplete"
  | "mandatoryTotal"
  | "mandatoryComplete"
  | "riskCount"
  | "needsReview"
> {
  const reqs = getRequirementsForRfp(rfpId);
  const complete = reqs.filter((r) => r.status === "approved").length;
  const mandatory = reqs.filter((r) => r.mandatory);
  const mandatoryComplete = mandatory.filter((r) => r.status === "approved").length;
  const needsReview = reqs.filter(
    (r) => r.status === "needs_review" || r.status === "changes_requested",
  ).length;
  return {
    requirementsTotal: reqs.length,
    requirementsComplete: complete,
    mandatoryTotal: mandatory.length,
    mandatoryComplete,
    riskCount: riskCounts(rfpId),
    needsReview,
  };
}

export const rfps: Rfp[] = [
  {
    id: "rfp-1",
    title: "Enterprise Cloud Platform RFP",
    customer: "Meridian Health Systems",
    ownerId: "p1",
    opportunity: "OPP-20412",
    estimatedValue: 1850000,
    deadline: "2026-09-05",
    status: "in_progress",
    progress: 82,
    ...computeFromRequirements("rfp-1"),
    evidenceCoverage: 88,
    readiness: 76,
    createdAt: "2026-07-28",
    documents: [
      { id: "doc1", name: "Meridian_RFP_Master.pdf", type: "PDF", sizeMb: 12.4, status: "ready" },
      {
        id: "doc2",
        name: "Technical_Requirements_Appendix.xlsx",
        type: "XLSX",
        sizeMb: 3.1,
        status: "ready",
      },
      {
        id: "doc3",
        name: "Security_Questionnaire.docx",
        type: "DOCX",
        sizeMb: 0.8,
        status: "ready",
      },
    ],
    collaboratorIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p9"],
  },
  {
    id: "rfp-2",
    title: "Supply Chain Visibility Platform",
    customer: "Globex Logistics",
    ownerId: "p1",
    opportunity: "OPP-20388",
    estimatedValue: 940000,
    deadline: "2026-09-12",
    status: "review",
    progress: 68,
    ...computeFromRequirements("rfp-2"),
    evidenceCoverage: 74,
    readiness: 61,
    createdAt: "2026-08-01",
    documents: [
      { id: "doc4", name: "Globex_SCV_RFP.pdf", type: "PDF", sizeMb: 8.9, status: "ready" },
      {
        id: "doc5",
        name: "Carrier_Integration_Requirements.docx",
        type: "DOCX",
        sizeMb: 1.4,
        status: "ready",
      },
    ],
    collaboratorIds: ["p1", "p2", "p3", "p5", "p6", "p7"],
  },
  {
    id: "rfp-3",
    title: "Customer Data Platform RFP",
    customer: "Northwind Retail Group",
    ownerId: "p8",
    opportunity: "OPP-20455",
    estimatedValue: 1220000,
    deadline: "2026-08-24",
    status: "needs_attention",
    progress: 44,
    ...computeFromRequirements("rfp-3"),
    evidenceCoverage: 58,
    readiness: 39,
    createdAt: "2026-08-05",
    documents: [
      { id: "doc6", name: "Northwind_CDP_RFP.pdf", type: "PDF", sizeMb: 15.2, status: "ready" },
      {
        id: "doc7",
        name: "Privacy_Compliance_Annex.pdf",
        type: "PDF",
        sizeMb: 2.6,
        status: "ready",
      },
    ],
    collaboratorIds: ["p1", "p2", "p3", "p6", "p8", "p9"],
  },
  {
    id: "rfp-4",
    title: "Core Banking Integration RFP",
    customer: "Arcadia Financial",
    ownerId: "p8",
    opportunity: "OPP-20502",
    estimatedValue: 2650000,
    deadline: "2026-10-15",
    status: "draft",
    progress: 0,
    requirementsTotal: 0,
    requirementsComplete: 0,
    mandatoryTotal: 0,
    mandatoryComplete: 0,
    riskCount: { low: 0, medium: 0, high: 0, critical: 0 },
    needsReview: 0,
    evidenceCoverage: 0,
    readiness: 4,
    createdAt: "2026-08-19",
    documents: [
      { id: "doc8", name: "Arcadia_RFP_Draft.pdf", type: "PDF", sizeMb: 6.3, status: "queued" },
    ],
    collaboratorIds: ["p1", "p8"],
  },
  {
    id: "rfp-5",
    title: "Field Service Management Platform",
    customer: "Brightline Energy",
    ownerId: "p1",
    opportunity: "OPP-20470",
    estimatedValue: 780000,
    deadline: "2026-09-20",
    status: "analyzing",
    progress: 12,
    requirementsTotal: 96,
    requirementsComplete: 0,
    mandatoryTotal: 41,
    mandatoryComplete: 0,
    riskCount: { low: 0, medium: 0, high: 0, critical: 0 },
    needsReview: 0,
    evidenceCoverage: 0,
    readiness: 8,
    createdAt: "2026-08-15",
    documents: [
      {
        id: "doc9",
        name: "Brightline_FSM_RFP.pdf",
        type: "PDF",
        sizeMb: 9.7,
        status: "processing",
      },
      {
        id: "doc10",
        name: "Technical_Annex.docx",
        type: "DOCX",
        sizeMb: 2.1,
        status: "processing",
      },
    ],
    collaboratorIds: ["p1", "p4", "p6"],
  },
  {
    id: "rfp-6",
    title: "Learning Platform Modernization",
    customer: "Summit University",
    ownerId: "p1",
    opportunity: "OPP-20211",
    estimatedValue: 610000,
    deadline: "2026-08-18",
    status: "submitted",
    progress: 100,
    requirementsTotal: 118,
    requirementsComplete: 118,
    mandatoryTotal: 52,
    mandatoryComplete: 52,
    riskCount: { low: 88, medium: 24, high: 6, critical: 0 },
    needsReview: 0,
    evidenceCoverage: 96,
    readiness: 100,
    createdAt: "2026-07-02",
    documents: [
      { id: "doc11", name: "Summit_LMS_RFP.pdf", type: "PDF", sizeMb: 11.0, status: "ready" },
    ],
    collaboratorIds: ["p1", "p2", "p3", "p4", "p6"],
  },
  {
    id: "rfp-7",
    title: "Claims Automation Suite",
    customer: "Vantage Insurance",
    ownerId: "p8",
    opportunity: "OPP-19980",
    estimatedValue: 3100000,
    deadline: "2026-06-30",
    status: "won",
    progress: 100,
    requirementsTotal: 204,
    requirementsComplete: 204,
    mandatoryTotal: 96,
    mandatoryComplete: 96,
    riskCount: { low: 160, medium: 38, high: 6, critical: 0 },
    needsReview: 0,
    evidenceCoverage: 98,
    readiness: 100,
    createdAt: "2026-04-11",
    documents: [
      { id: "doc12", name: "Vantage_Claims_RFP.pdf", type: "PDF", sizeMb: 18.4, status: "ready" },
    ],
    collaboratorIds: ["p1", "p2", "p3", "p4", "p5", "p8"],
  },
  {
    id: "rfp-8",
    title: "Loyalty Platform RFP",
    customer: "Cordial Retail",
    ownerId: "p8",
    opportunity: "OPP-19845",
    estimatedValue: 540000,
    deadline: "2026-05-22",
    status: "lost",
    progress: 100,
    requirementsTotal: 74,
    requirementsComplete: 74,
    mandatoryTotal: 30,
    mandatoryComplete: 28,
    riskCount: { low: 48, medium: 20, high: 6, critical: 0 },
    needsReview: 0,
    evidenceCoverage: 91,
    readiness: 100,
    createdAt: "2026-03-08",
    documents: [
      { id: "doc13", name: "Cordial_Loyalty_RFP.pdf", type: "PDF", sizeMb: 7.5, status: "ready" },
    ],
    collaboratorIds: ["p1", "p5", "p8"],
  },
];

export function getRfp(id: string): Rfp | undefined {
  return rfps.find((r) => r.id === id);
}
