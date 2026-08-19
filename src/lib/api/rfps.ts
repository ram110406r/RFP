import { queryOptions } from "@tanstack/react-query";
import { rfps, getRfp } from "@/data/rfps";
import { delay, ApiNotFoundError } from "./client";
import type { Rfp, RfpDocument } from "@/types";

export async function fetchRfps(): Promise<Rfp[]> {
  return delay(rfps);
}

export async function fetchRfp(id: string): Promise<Rfp> {
  const rfp = getRfp(id);
  if (!rfp) throw new ApiNotFoundError("RFP", id);
  return delay(rfp);
}

export const rfpsQueryOptions = () => queryOptions({ queryKey: ["rfps"], queryFn: fetchRfps });

export const rfpQueryOptions = (rfpId: string) =>
  queryOptions({ queryKey: ["rfps", rfpId], queryFn: () => fetchRfp(rfpId) });

export interface NewRfpInput {
  title: string;
  customer: string;
  opportunity: string;
  estimatedValue: number;
  deadline: string;
  ownerId: string;
  documents: { name: string; type: RfpDocument["type"]; sizeMb: number }[];
  asDraft?: boolean;
}

let rfpSequence = rfps.length + 1;

export async function createRfp(input: NewRfpInput): Promise<Rfp> {
  const id = `rfp-${rfpSequence++}`;
  const rfp: Rfp = {
    id,
    title: input.title,
    customer: input.customer,
    ownerId: input.ownerId,
    opportunity: input.opportunity || `OPP-${20000 + rfpSequence}`,
    estimatedValue: input.estimatedValue,
    deadline: input.deadline,
    status: input.asDraft ? "draft" : "analyzing",
    progress: input.asDraft ? 0 : 4,
    requirementsTotal: 0,
    requirementsComplete: 0,
    mandatoryTotal: 0,
    mandatoryComplete: 0,
    riskCount: { low: 0, medium: 0, high: 0, critical: 0 },
    needsReview: 0,
    evidenceCoverage: 0,
    readiness: input.asDraft ? 0 : 5,
    createdAt: new Date().toISOString().slice(0, 10),
    documents: input.documents.map((doc, i) => ({
      id: `${id}-doc${i + 1}`,
      name: doc.name,
      type: doc.type,
      sizeMb: doc.sizeMb,
      status: input.asDraft ? ("queued" as const) : ("processing" as const),
    })),
    collaboratorIds: [input.ownerId],
  };
  rfps.unshift(rfp);
  return delay(rfp, 400);
}
