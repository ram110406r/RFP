import type { Permission } from "@rfp-os/types";

export const RFP_LIFECYCLE_STATUSES = [
  "DRAFT",
  "INTAKE",
  "PARSING",
  "ANALYZING",
  "QUALIFICATION",
  "RESPONSE",
  "REVIEW",
  "VALIDATION",
  "READY_FOR_SUBMISSION",
  "SUBMITTED",
  "OUTCOME_RECORDED",
  "CLOSED",
  "PARSING_FAILED",
  "ANALYSIS_FAILED",
  "VALIDATION_FAILED",
] as const;

export type RfpLifecycleStatus = (typeof RFP_LIFECYCLE_STATUSES)[number];

/** States that represent a failed stage rather than forward progress. */
export const RFP_FAILURE_STATUSES = [
  "PARSING_FAILED",
  "ANALYSIS_FAILED",
  "VALIDATION_FAILED",
] as const satisfies readonly RfpLifecycleStatus[];

/** No transition leaves CLOSED — it is where an RFP's lifecycle ends. */
export const RFP_TERMINAL_STATUSES = ["CLOSED"] as const satisfies readonly RfpLifecycleStatus[];

export interface TransitionRule {
  from: RfpLifecycleStatus;
  to: RfpLifecycleStatus;
  /**
   * Permission required *in addition to* rfp:update, which the transition
   * endpoint already demands. Approving a validated RFP and actually
   * submitting it are materially heavier acts than moving it from DRAFT to
   * INTAKE, and the permission model should say so rather than treating every
   * edge as the same privilege.
   */
  permission?: Permission;
  description: string;
}

/**
 * The lifecycle, as data rather than as a switch statement.
 *
 * Expressing transitions as a table means the rules can be enumerated, tested
 * and rendered (a UI can ask "what can I do from here") instead of being
 * implicit in control flow. Anything not listed here is not a legal move.
 */
export const RFP_TRANSITIONS: readonly TransitionRule[] = [
  { from: "DRAFT", to: "INTAKE", description: "Begin intake." },
  { from: "INTAKE", to: "PARSING", description: "Start document parsing." },

  { from: "PARSING", to: "ANALYZING", description: "Parsing succeeded; begin analysis." },
  { from: "PARSING", to: "PARSING_FAILED", description: "Parsing failed." },
  { from: "PARSING_FAILED", to: "PARSING", description: "Retry parsing." },

  { from: "ANALYZING", to: "QUALIFICATION", description: "Analysis complete; qualify." },
  { from: "ANALYZING", to: "ANALYSIS_FAILED", description: "Analysis failed." },
  { from: "ANALYSIS_FAILED", to: "ANALYZING", description: "Retry analysis." },

  { from: "QUALIFICATION", to: "RESPONSE", description: "Qualified; begin responding." },
  { from: "RESPONSE", to: "REVIEW", description: "Send responses for review." },
  { from: "REVIEW", to: "VALIDATION", description: "Reviewed; validate the package." },

  {
    from: "VALIDATION",
    to: "READY_FOR_SUBMISSION",
    permission: "rfp:approve",
    description: "Validation passed; mark ready to submit.",
  },
  { from: "VALIDATION", to: "VALIDATION_FAILED", description: "Validation failed." },
  { from: "VALIDATION_FAILED", to: "VALIDATION", description: "Re-run validation." },

  {
    from: "READY_FOR_SUBMISSION",
    to: "SUBMITTED",
    permission: "rfp:submit",
    description: "Submit the response.",
  },
  { from: "SUBMITTED", to: "OUTCOME_RECORDED", description: "Record the outcome." },
  { from: "OUTCOME_RECORDED", to: "CLOSED", description: "Close the RFP." },
];

/** Indexed once at module load; the table is static. */
const TRANSITIONS_BY_FROM = new Map<RfpLifecycleStatus, TransitionRule[]>();
for (const rule of RFP_TRANSITIONS) {
  const existing = TRANSITIONS_BY_FROM.get(rule.from);
  if (existing) existing.push(rule);
  else TRANSITIONS_BY_FROM.set(rule.from, [rule]);
}

export function isRfpLifecycleStatus(value: unknown): value is RfpLifecycleStatus {
  return typeof value === "string" && (RFP_LIFECYCLE_STATUSES as readonly string[]).includes(value);
}

export function isFailureStatus(status: RfpLifecycleStatus): boolean {
  return (RFP_FAILURE_STATUSES as readonly string[]).includes(status);
}

export function isTerminalStatus(status: RfpLifecycleStatus): boolean {
  return (RFP_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Every legal next state from `status`, for both callers and UI affordances. */
export function allowedTransitionsFrom(status: RfpLifecycleStatus): readonly TransitionRule[] {
  return TRANSITIONS_BY_FROM.get(status) ?? [];
}

export function findTransition(
  from: RfpLifecycleStatus,
  to: RfpLifecycleStatus,
): TransitionRule | undefined {
  return allowedTransitionsFrom(from).find((rule) => rule.to === to);
}

export function canTransition(from: RfpLifecycleStatus, to: RfpLifecycleStatus): boolean {
  return findTransition(from, to) !== undefined;
}

/**
 * The permission a specific move requires, beyond the endpoint's rfp:update.
 * Undefined means rfp:update alone suffices.
 */
export function permissionForTransition(
  from: RfpLifecycleStatus,
  to: RfpLifecycleStatus,
): Permission | undefined {
  return findTransition(from, to)?.permission;
}
