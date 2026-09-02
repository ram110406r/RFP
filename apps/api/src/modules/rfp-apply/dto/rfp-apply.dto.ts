import { z } from "zod";

const uuid = z.string().uuid();

export const rfpApplyPhaseSchema = z.enum(["ANALYZE", "GENERATE", "VALIDATE", "FULL"]);

export const runRfpApplySchema = z
  .object({
    phase: rfpApplyPhaseSchema.default("FULL"),
    requirementIds: z.array(uuid).max(25).optional(),
    limit: z.coerce.number().int().positive().max(10).default(10),
  })
  .strict();

export type RunRfpApplyInput = z.infer<typeof runRfpApplySchema>;
