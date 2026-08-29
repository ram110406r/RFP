import type { TenderStatus as SharedTenderStatus } from "@rfp-os/types";

export type TenderStatus = SharedTenderStatus;
export const TENDER_LIFECYCLE_STATUSES = [
  "DRAFT",
  "INTAKE",
  "PROCESSING",
  "READY",
  "IN_PROGRESS",
  "REVIEW",
  "APPROVED",
  "SUBMITTED",
  "CLOSED",
  "CANCELLED",
  "ARCHIVED",
] as const satisfies readonly TenderStatus[];

type TenderTransitionRule = {
  from: TenderStatus;
  to: TenderStatus;
  description: string;
  permission: "tender:update" | "tender:approve" | "tender:submit" | "tender:delete";
};

const RULES: readonly TenderTransitionRule[] = [
  { from: "DRAFT", to: "INTAKE", description: "Move the tender into intake.", permission: "tender:update" },
  { from: "INTAKE", to: "PROCESSING", description: "Start processing the tender.", permission: "tender:update" },
  { from: "PROCESSING", to: "READY", description: "Mark the tender ready for work.", permission: "tender:update" },
  { from: "READY", to: "IN_PROGRESS", description: "Start active work.", permission: "tender:update" },
  { from: "IN_PROGRESS", to: "REVIEW", description: "Send the tender to review.", permission: "tender:update" },
  { from: "REVIEW", to: "IN_PROGRESS", description: "Return the tender to active work.", permission: "tender:update" },
  { from: "REVIEW", to: "APPROVED", description: "Approve the tender response.", permission: "tender:approve" },
  { from: "APPROVED", to: "SUBMITTED", description: "Submit the response.", permission: "tender:submit" },
  { from: "SUBMITTED", to: "CLOSED", description: "Close the submitted tender.", permission: "tender:update" },
  { from: "DRAFT", to: "CANCELLED", description: "Cancel the tender.", permission: "tender:delete" },
  { from: "INTAKE", to: "CANCELLED", description: "Cancel the tender.", permission: "tender:delete" },
  { from: "PROCESSING", to: "CANCELLED", description: "Cancel the tender.", permission: "tender:delete" },
  { from: "READY", to: "CANCELLED", description: "Cancel the tender.", permission: "tender:delete" },
  { from: "IN_PROGRESS", to: "CANCELLED", description: "Cancel the tender.", permission: "tender:delete" },
  { from: "REVIEW", to: "CANCELLED", description: "Cancel the tender.", permission: "tender:delete" },
  { from: "APPROVED", to: "CANCELLED", description: "Cancel the tender.", permission: "tender:delete" },
  { from: "SUBMITTED", to: "CANCELLED", description: "Cancel the tender.", permission: "tender:delete" },
  { from: "CANCELLED", to: "ARCHIVED", description: "Archive the cancelled tender.", permission: "tender:delete" },
  { from: "CLOSED", to: "ARCHIVED", description: "Archive the closed tender.", permission: "tender:delete" },
];

export function allowedTransitionsFrom(from: TenderStatus) {
  return RULES.filter((rule) => rule.from === from);
}

export function canTransitionTender(from: TenderStatus, to: TenderStatus): boolean {
  return RULES.some((rule) => rule.from === from && rule.to === to);
}

export function permissionForTenderTransition(
  _from: TenderStatus,
  to: TenderStatus,
): TenderTransitionRule["permission"] {
  return (
    RULES.find((rule) => rule.to === to)?.permission ??
    "tender:update"
  );
}
