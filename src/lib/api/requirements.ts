import { queryOptions } from "@tanstack/react-query";
import { requirements, getRequirement, getRequirementsForRfp } from "@/data/requirements";
import { reviews } from "@/data/reviews";
import { getRfp, computeFromRequirements } from "@/data/rfps";
import { CURRENT_USER_ID } from "@/data/people";
import { delay, ApiNotFoundError } from "./client";
import type { ActivityEntry, Requirement, RequirementStatus } from "@/types";

export async function fetchRequirementsForRfp(rfpId: string): Promise<Requirement[]> {
  return delay(getRequirementsForRfp(rfpId));
}

export async function fetchAllRequirements(): Promise<Requirement[]> {
  return delay(requirements);
}

export const allRequirementsQueryOptions = () =>
  queryOptions({
    queryKey: ["requirements", "all"],
    queryFn: fetchAllRequirements,
    staleTime: 60 * 1000,
  });

export async function fetchRequirement(id: string): Promise<Requirement> {
  const req = getRequirement(id);
  if (!req) throw new ApiNotFoundError("Requirement", id);
  return delay(req);
}

export const requirementsForRfpQueryOptions = (rfpId: string) =>
  queryOptions({
    queryKey: ["requirements", "byRfp", rfpId],
    queryFn: () => fetchRequirementsForRfp(rfpId),
  });

export const requirementQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["requirements", id], queryFn: () => fetchRequirement(id) });

function mustFind(id: string): Requirement {
  const req = requirements.find((r) => r.id === id);
  if (!req) throw new ApiNotFoundError("Requirement", id);
  return req;
}

function pushActivity(req: Requirement, kind: ActivityEntry["kind"], label: string, actor: string) {
  req.activity = [
    ...req.activity,
    {
      id: `${req.id}-act${req.activity.length + 1}`,
      at: new Date().toISOString(),
      kind,
      label,
      actor,
    },
  ];
}

export async function updateRequirementAnswer(
  id: string,
  answer: string,
  actor: string,
): Promise<Requirement> {
  const req = mustFind(id);
  req.answer = answer;
  req.answerSource = "human_edited";
  if (req.status === "unanswered") req.status = "drafted";
  pushActivity(req, "comment", "Answer edited manually", actor);
  return delay(req);
}

// A real backend would call an LLM here; the mock layer simulates a fresh
// draft by rotating a lead-in clause so the visible answer text actually
// changes on every click instead of silently no-opping.
const REGENERATE_OPENERS = [
  "Based on our current documentation, ",
  "Drawing on the latest verified sources, ",
  "Per our most recent internal review, ",
];

function withRotatedOpener(text: string, variantIndex: number): string {
  const stripped = REGENERATE_OPENERS.reduce(
    (t, opener) => (t.startsWith(opener) ? t.slice(opener.length) : t),
    text,
  );
  return `${REGENERATE_OPENERS[variantIndex % REGENERATE_OPENERS.length]}${stripped}`;
}

export async function regenerateDraft(id: string, actor: string): Promise<Requirement> {
  const req = mustFind(id);
  const regenerationCount = req.activity.filter((a) => a.kind === "generated").length;
  req.answer = req.answer
    ? withRotatedOpener(req.answer, regenerationCount)
    : `Draft response to: "${req.question}" — a first pass covering ${req.category.toLowerCase()} requirements, pending SME review before submission.`;
  req.answerSource = "ai_draft";
  if (req.status === "unanswered") req.status = "drafted";
  req.confidence = Math.min(0.98, req.confidence + 0.04);
  pushActivity(req, "generated", "AI draft regenerated", actor);
  return delay(req, 900);
}

export async function setRequirementStatus(
  id: string,
  status: RequirementStatus,
  actor: string,
  note?: string,
): Promise<Requirement> {
  const req = mustFind(id);
  req.status = status;
  const kind: ActivityEntry["kind"] =
    status === "approved" ? "approved" : status === "rejected" ? "rejected" : "comment";
  const label =
    status === "approved"
      ? "Approved"
      : status === "rejected"
        ? "Rejected"
        : status === "changes_requested"
          ? `Changes requested${note ? `: ${note}` : ""}`
          : `Status changed to ${status.replace("_", " ")}`;
  pushActivity(req, kind, label, actor);
  // Keep the parent RFP's derived aggregates (progress strip / intelligence
  // panel / readiness dial) consistent with the requirement's new status.
  const rfp = getRfp(req.rfpId);
  if (rfp) Object.assign(rfp, computeFromRequirements(req.rfpId));
  return delay(req);
}

export async function assignReviewer(
  id: string,
  reviewerId: string,
  actor: string,
): Promise<Requirement> {
  const req = mustFind(id);
  req.reviewerId = reviewerId;
  pushActivity(req, "assigned", "Reviewer assigned", actor);
  // Keep the Reviews queue's ReviewItem records (a separate, denormalized
  // list) in sync — they carry their own reviewerId/mine copy.
  for (const review of reviews) {
    if (review.requirementId === id) {
      review.reviewerId = reviewerId;
      review.mine = reviewerId === CURRENT_USER_ID;
    }
  }
  return delay(req);
}
