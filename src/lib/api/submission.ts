import { queryOptions } from "@tanstack/react-query";
import { getSubmissionVersions } from "@/data/submission";
import { delay } from "./client";
import type { SubmissionVersion } from "@/types";

export async function fetchSubmissionVersions(rfpId: string): Promise<SubmissionVersion[]> {
  return delay(getSubmissionVersions(rfpId));
}

export const submissionVersionsQueryOptions = (rfpId: string) =>
  queryOptions({ queryKey: ["submission", rfpId], queryFn: () => fetchSubmissionVersions(rfpId) });

export async function generateSubmissionPackage(
  rfpId: string,
  actor: string,
): Promise<SubmissionVersion> {
  const versions = getSubmissionVersions(rfpId);
  const nextIndex = versions.length + 1;
  const version: SubmissionVersion = {
    id: `${rfpId}-sv-${nextIndex}`,
    label: `Version ${nextIndex} (current draft)`,
    createdAt: new Date().toISOString(),
    createdBy: actor,
    note: "Generated from the latest approved requirement responses.",
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
  };
  versions.unshift(version);
  return delay(version, 1200);
}
