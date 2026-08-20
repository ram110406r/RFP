import type { ReviewItem } from "@/types";
import { getRequirement } from "./requirements";
import { getRfp } from "./rfps";

const TODAY = "2026-08-20";

export function computeOverdue(due: string, status: ReviewItem["status"]): boolean {
  return due < TODAY && status !== "approved" && status !== "rejected";
}

function build(
  id: string,
  requirementId: string,
  reviewerId: string,
  due: string,
  status: ReviewItem["status"],
  mine: boolean,
  comments: ReviewItem["comments"],
  history: ReviewItem["history"],
): ReviewItem {
  const req = getRequirement(requirementId);
  if (!req) throw new Error(`Unknown requirement ${requirementId}`);
  const rfp = getRfp(req.rfpId);
  return {
    id,
    requirementId,
    rfpId: req.rfpId,
    rfpTitle: rfp?.title ?? "Unknown RFP",
    requirementCode: req.code,
    requirementTitle: req.title,
    category: req.category,
    risk: req.risk,
    confidence: req.confidence,
    reviewerId,
    due,
    status,
    mine,
    overdue: computeOverdue(due, status),
    comments,
    history,
  };
}

export const reviews: ReviewItem[] = [
  build(
    "rev1",
    "req-mh-sec-05",
    "p2",
    "2026-08-20",
    "changes_requested",
    false,
    [
      {
        id: "cm1",
        authorId: "p2",
        at: "2026-08-08T10:15:00Z",
        body: "Need an exact notification SLA — pull from the master security addendum, not general policy language.",
      },
    ],
    [{ id: "h1", at: "2026-08-08T10:15:00Z", label: "Changes requested", actorId: "p2" }],
  ),
  build(
    "rev2",
    "req-mh-sec-04",
    "p2",
    "2026-08-21",
    "in_review",
    false,
    [
      {
        id: "cm1",
        authorId: "p2",
        at: "2026-08-07T15:22:00Z",
        body: "This reads plausible but I can't find a source backing the 7-day remediation SLA. Flagging high risk.",
      },
    ],
    [{ id: "h1", at: "2026-08-07T15:22:00Z", label: "Marked high risk", actorId: "p2" }],
  ),
  build(
    "rev3",
    "req-mh-sec-03",
    "p2",
    "2026-08-23",
    "pending",
    false,
    [],
    [{ id: "h1", at: "2026-08-06T08:40:00Z", label: "Assigned for review", actorId: "p1" }],
  ),
  build(
    "rev4",
    "req-mh-cmp-01",
    "p9",
    "2026-08-21",
    "in_review",
    false,
    [
      {
        id: "cm1",
        authorId: "p9",
        at: "2026-08-07T09:10:00Z",
        body: "We need a dedicated HIPAA control mapping document before this can go out under our name.",
      },
    ],
    [{ id: "h1", at: "2026-08-05T12:00:00Z", label: "Draft generated", actorId: "AI Assistant" }],
  ),
  build(
    "rev5",
    "req-mh-com-03",
    "p1",
    "2026-08-27",
    "pending",
    true,
    [],
    [{ id: "h1", at: "2026-08-06T09:30:00Z", label: "Draft generated", actorId: "AI Assistant" }],
  ),
  build(
    "rev6",
    "req-mh-prd-01",
    "p1",
    "2026-08-22",
    "in_review",
    true,
    [
      {
        id: "cm1",
        authorId: "p6",
        at: "2026-08-08T09:00:00Z",
        body: "Conflicts with a reused answer from the Meridian regional RFP — verify against the current architecture doc before approving.",
      },
    ],
    [{ id: "h1", at: "2026-08-06T13:40:00Z", label: "Draft generated", actorId: "AI Assistant" }],
  ),
  build(
    "rev7",
    "req-mh-arc-01",
    "p4",
    "2026-08-23",
    "pending",
    false,
    [],
    [{ id: "h1", at: "2026-08-06T14:00:00Z", label: "Draft generated", actorId: "AI Assistant" }],
  ),
  build(
    "rev8",
    "req-mh-sup-01",
    "p7",
    "2026-08-21",
    "in_review",
    false,
    [
      {
        id: "cm1",
        authorId: "p7",
        at: "2026-08-08T08:30:00Z",
        body: "Source is 289 days old — request a refreshed Support SLA Policy from the knowledge team before we approve.",
      },
    ],
    [{ id: "h1", at: "2026-08-05T13:15:00Z", label: "Draft generated", actorId: "AI Assistant" }],
  ),
  build(
    "rev9",
    "req-mh-lgl-02",
    "p3",
    "2026-08-21",
    "changes_requested",
    false,
    [
      {
        id: "cm1",
        authorId: "p3",
        at: "2026-08-08T13:00:00Z",
        body: "Confirm the 90-day term against the current legal playbook before this is approved.",
      },
    ],
    [{ id: "h1", at: "2026-08-08T13:00:00Z", label: "Changes requested", actorId: "p3" }],
  ),
  build(
    "rev10",
    "req-gx-sec-02",
    "p2",
    "2026-08-29",
    "pending",
    false,
    [],
    [{ id: "h1", at: "2026-08-11T10:00:00Z", label: "Draft generated", actorId: "AI Assistant" }],
  ),
  build(
    "rev11",
    "req-gx-cmp-01",
    "p1",
    "2026-08-27",
    "in_review",
    true,
    [
      {
        id: "cm1",
        authorId: "p9",
        at: "2026-08-11T11:30:00Z",
        body: "We have nothing on trade compliance recordkeeping in the library — worth a knowledge gap ticket.",
      },
    ],
    [{ id: "h1", at: "2026-08-11T11:00:00Z", label: "Draft generated", actorId: "AI Assistant" }],
  ),
  build(
    "rev12",
    "req-gx-lgl-01",
    "p3",
    "2026-08-26",
    "changes_requested",
    false,
    [
      {
        id: "cm1",
        authorId: "p3",
        at: "2026-08-12T09:00:00Z",
        body: "Needs precise freight liability carve-out language reviewed by legal before approval.",
      },
    ],
    [{ id: "h1", at: "2026-08-12T09:00:00Z", label: "Changes requested", actorId: "p3" }],
  ),
  build(
    "rev13",
    "req-nw-sec-01",
    "p2",
    "2026-09-04",
    "pending",
    false,
    [],
    [{ id: "h1", at: "2026-08-12T09:00:00Z", label: "Draft generated", actorId: "AI Assistant" }],
  ),
  build(
    "rev14",
    "req-nw-prd-01",
    "p6",
    "2026-09-03",
    "pending",
    false,
    [],
    [{ id: "h1", at: "2026-08-12T12:00:00Z", label: "Draft generated", actorId: "AI Assistant" }],
  ),
  build(
    "rev15",
    "req-mh-sec-01",
    "p2",
    "2026-08-04",
    "approved",
    false,
    [],
    [
      { id: "h1", at: "2026-08-02T09:12:00Z", label: "Draft generated", actorId: "AI Assistant" },
      { id: "h2", at: "2026-08-04T14:20:00Z", label: "Approved", actorId: "p2" },
    ],
  ),
];

export function getReviewsForUser(userId: string): ReviewItem[] {
  return reviews.filter((r) => r.reviewerId === userId);
}
