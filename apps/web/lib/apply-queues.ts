import type {
  DashboardTenderCard,
  TenderSummary,
} from "./models";

type QueuePackage = DashboardTenderCard["latestPackage"];
type QueueRun = DashboardTenderCard["latestRun"];

export type ApplyQueueTab = "all" | "mine" | "review" | "approval" | "ready" | "submitted" | "blocked";

export const APPLY_QUEUE_TABS: Array<{ key: ApplyQueueTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "review", label: "Needs review" },
  { key: "approval", label: "Needs approval" },
  { key: "ready", label: "Ready to submit" },
  { key: "submitted", label: "Submitted" },
  { key: "blocked", label: "Blocked" },
];

export type ApplyQueueState = {
  needsReview: boolean;
  needsApproval: boolean;
  readyToSubmit: boolean;
  submitted: boolean;
  blocked: boolean;
  mine: boolean;
  latestPackageStatus: string | null;
  reason: string;
};

export function classifyApplication(
  row: DashboardTenderCard,
  latestPackage?: QueuePackage,
  latestRun?: QueueRun,
  currentUserId?: string | null,
): ApplyQueueState {
  const tender = row.tender;
  const packageStatus = latestPackage?.status ?? null;
  const runStatus = latestRun?.status ?? null;
  const submitted = tender.status === "SUBMITTED";
  const needsReview = !submitted && (row.pendingReviews > 0 || tender.status === "REVIEW");
  const needsApproval = !submitted && tender.status === "REVIEW" && packageStatus === "READY";
  const readyToSubmit = !submitted && tender.status === "APPROVED" && packageStatus === "APPROVED";
  const blocked =
    !submitted &&
    (row.blockingIssueCount > 0 ||
      packageStatus === "FAILED" ||
      packageStatus === "STALE" ||
      runStatus === "FAILED" ||
      runStatus === "BLOCKED" ||
      runStatus === "PARTIAL" ||
      runStatus === "WAITING_FOR_INPUT");
  const mine = Boolean(currentUserId && tender.ownerId === currentUserId);

  return {
    needsReview,
    needsApproval,
    readyToSubmit,
    submitted,
    blocked,
    mine,
    latestPackageStatus: packageStatus,
    reason: queueReason(tender, row, latestPackage, latestRun),
  };
}

export function matchesApplyQueue(tab: ApplyQueueTab, state: ApplyQueueState): boolean {
  if (tab === "all") return true;
  if (tab === "mine") return state.mine;
  if (tab === "review") return state.needsReview;
  if (tab === "approval") return state.needsApproval;
  if (tab === "ready") return state.readyToSubmit;
  if (tab === "submitted") return state.submitted;
  return state.blocked;
}

function queueReason(
  tender: TenderSummary,
  row: DashboardTenderCard,
  latestPackage?: QueuePackage,
  latestRun?: QueueRun,
) {
  if (tender.status === "SUBMITTED") return "Submission recorded";
  if (latestPackage?.status === "FAILED") return "Package generation failed";
  if (latestPackage?.status === "STALE") return "Package is stale";
  if (latestRun && ["FAILED", "BLOCKED", "PARTIAL", "WAITING_FOR_INPUT"].includes(latestRun.status)) return `Preparation ${latestRun.status.toLowerCase().replace(/_/g, " ")}`;
  if (row.blockingIssueCount > 0) return `${row.blockingIssueCount} blocking issue${row.blockingIssueCount === 1 ? "" : "s"}`;
  if (tender.status === "REVIEW" && latestPackage?.status === "READY") return "Package ready for approval";
  if (tender.status === "APPROVED" && latestPackage?.status === "APPROVED") return "Approved package ready to submit";
  if (row.pendingReviews > 0) return `${row.pendingReviews} review${row.pendingReviews === 1 ? "" : "s"} pending`;
  return "Continue response work";
}
