import { z } from "zod";
import { TENDER_SOURCE_KINDS } from "@rfp-os/types";

const filename = z.string().trim().min(1).max(255);
const mimeType = z.string().trim().min(1).max(255);
const metadata = z.record(z.unknown()).optional();

export const tenderSourceKindSchema = z.enum(TENDER_SOURCE_KINDS);

export const createTenderSourceUploadIntentSchema = z
  .object({
    sourceType: tenderSourceKindSchema.default("DOCUMENT"),
    name: z.string().trim().min(1).max(300).optional(),
    filename,
    mimeType,
    sizeBytes: z.coerce.number().int().positive().max(1_000_000_000),
    externalReference: z.string().trim().max(200).optional(),
    sourceUrl: z.string().url().optional(),
    metadata,
  })
  .strict();

export type CreateTenderSourceUploadIntentInput = z.infer<
  typeof createTenderSourceUploadIntentSchema
>;

