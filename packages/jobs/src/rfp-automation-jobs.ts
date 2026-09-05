export const RFP_AUTOMATION_JOBS = {
  REQUIREMENT_EXTRACTION: "RFP_REQUIREMENT_EXTRACTION",
  ANALYSIS: "RFP_ANALYSIS",
  EVIDENCE_RETRIEVAL: "RFP_EVIDENCE_RETRIEVAL",
  ANSWER_GENERATION: "RFP_ANSWER_GENERATION",
  VALIDATION: "RFP_VALIDATION",
  PACKAGE_GENERATION: "RFP_PACKAGE_GENERATION",
  REMINDER_RECONCILIATION: "RFP_REMINDER_RECONCILIATION",
} as const;

export type RfpAutomationJobName = (typeof RFP_AUTOMATION_JOBS)[keyof typeof RFP_AUTOMATION_JOBS];
export interface RfpAutomationJobPayload {
  organizationId: string;
  workspaceId: string;
  tenderId: string;
  runId: string | null;
  step: RfpAutomationJobName;
  actorId: string | null;
  requirementId?: string;
  packageId?: string;
  milestoneId?: string;
}

export function rfpAutomationJobId(payload: RfpAutomationJobPayload) {
  return [payload.step, payload.runId ?? "scheduled", payload.requirementId ?? payload.packageId ?? payload.milestoneId ?? payload.tenderId].join(":");
}
