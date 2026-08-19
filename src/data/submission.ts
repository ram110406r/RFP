import type { SubmissionVersion } from "@/types";

const submissionsByRfp: Record<string, SubmissionVersion[]> = {
  "rfp-1": [
    {
      id: "sv1-2",
      label: "Version 2 (current draft)",
      createdAt: "2026-08-19T10:00:00Z",
      createdBy: "Priya Nair",
      note: "Incorporated legal edits to termination clause and refreshed pricing tables.",
      checklist: [
        { id: "chk1", label: "All mandatory requirements approved", done: false },
        { id: "chk2", label: "High & critical risk items resolved", done: false },
        { id: "chk3", label: "Legal clauses signed off", done: false },
        { id: "chk4", label: "Commercial terms confirmed", done: true },
        { id: "chk5", label: "Executive summary reviewed", done: true },
        { id: "chk6", label: "Formatting matches customer template", done: true },
      ],
      artifacts: [
        {
          id: "art1",
          label: "Technical Response.pdf",
          description: "Full requirement-by-requirement response document",
          ready: true,
        },
        {
          id: "art2",
          label: "Executive Summary.pdf",
          description: "3-page executive overview and value proposition",
          ready: true,
        },
        {
          id: "art3",
          label: "Pricing Schedule.xlsx",
          description: "Itemized pricing by module and tier",
          ready: true,
        },
        {
          id: "art4",
          label: "Compliance Appendix.pdf",
          description: "Certifications, attestations, and DPA",
          ready: false,
        },
      ],
    },
    {
      id: "sv1-1",
      label: "Version 1",
      createdAt: "2026-08-10T09:00:00Z",
      createdBy: "Priya Nair",
      note: "Initial full draft assembled after first review pass.",
      checklist: [
        { id: "chk1", label: "All mandatory requirements approved", done: false },
        { id: "chk2", label: "High & critical risk items resolved", done: false },
        { id: "chk3", label: "Legal clauses signed off", done: false },
        { id: "chk4", label: "Commercial terms confirmed", done: false },
        { id: "chk5", label: "Executive summary reviewed", done: false },
        { id: "chk6", label: "Formatting matches customer template", done: true },
      ],
      artifacts: [
        {
          id: "art1",
          label: "Technical Response.pdf",
          description: "Full requirement-by-requirement response document",
          ready: true,
        },
        {
          id: "art2",
          label: "Executive Summary.pdf",
          description: "3-page executive overview and value proposition",
          ready: false,
        },
      ],
    },
  ],
  "rfp-2": [
    {
      id: "sv2-1",
      label: "Version 1 (current draft)",
      createdAt: "2026-08-15T09:00:00Z",
      createdBy: "Priya Nair",
      note: "First complete draft pending legal review of freight liability language.",
      checklist: [
        { id: "chk1", label: "All mandatory requirements approved", done: false },
        { id: "chk2", label: "High & critical risk items resolved", done: false },
        { id: "chk3", label: "Legal clauses signed off", done: false },
        { id: "chk4", label: "Commercial terms confirmed", done: true },
        { id: "chk5", label: "Executive summary reviewed", done: true },
        { id: "chk6", label: "Formatting matches customer template", done: false },
      ],
      artifacts: [
        {
          id: "art1",
          label: "Technical Response.pdf",
          description: "Full requirement-by-requirement response document",
          ready: true,
        },
        {
          id: "art2",
          label: "Executive Summary.pdf",
          description: "3-page executive overview and value proposition",
          ready: true,
        },
      ],
    },
  ],
  "rfp-6": [
    {
      id: "sv6-1",
      label: "Version 1 (submitted)",
      createdAt: "2026-08-18T14:15:00Z",
      createdBy: "Priya Nair",
      note: "Final submitted package.",
      checklist: [
        { id: "chk1", label: "All mandatory requirements approved", done: true },
        { id: "chk2", label: "High & critical risk items resolved", done: true },
        { id: "chk3", label: "Legal clauses signed off", done: true },
        { id: "chk4", label: "Commercial terms confirmed", done: true },
        { id: "chk5", label: "Executive summary reviewed", done: true },
        { id: "chk6", label: "Formatting matches customer template", done: true },
      ],
      artifacts: [
        {
          id: "art1",
          label: "Technical Response.pdf",
          description: "Full requirement-by-requirement response document",
          ready: true,
        },
        {
          id: "art2",
          label: "Executive Summary.pdf",
          description: "3-page executive overview and value proposition",
          ready: true,
        },
        {
          id: "art3",
          label: "Pricing Schedule.xlsx",
          description: "Itemized pricing by module and tier",
          ready: true,
        },
      ],
    },
  ],
};

export function getSubmissionVersions(rfpId: string): SubmissionVersion[] {
  return (submissionsByRfp[rfpId] ??= []);
}
