import { z } from "zod";

import { ACCEPTED_MIME_TYPES } from "../domain/document-type";

/**
 * Request schemas for document endpoints.
 *
 * As in rfp.dto.ts, there is no `organizationId` field anywhere — the tenant
 * comes from the session. There is also no `status`: processing state is set
 * by the pipeline, never by a client, so `.strict()` turns an attempt to send
 * one into a 400 rather than a silently dropped field.
 */

const filename = z
  .string()
  .trim()
  .min(1, "is required")
  .max(255)
  /*
   * Path separators are rejected here rather than sanitized, so a caller
   * learns their filename was unacceptable. The key builder sanitizes as well
   * — defence in depth, since the worker and any later importer also build
   * keys from stored filenames.
   */
  .refine((value) => !value.includes("/") && !value.includes("\\"), {
    message: "must not contain a path",
  });

/**
 * `mimeType` is validated against the allowlist at the schema boundary so the
 * service never sees an unsupported type, and the 400 names what is accepted.
 */
const mimeType = z
  .string()
  .trim()
  .min(1, "is required")
  .max(255)
  .refine(
    (value) => ACCEPTED_MIME_TYPES.includes(value.split(";")[0]?.trim().toLowerCase() ?? ""),
    { message: `must be one of: ${ACCEPTED_MIME_TYPES.join(", ")}` },
  );

export const createUploadIntentSchema = z
  .object({
    filename,
    mimeType,
    /**
     * Declared up front so an oversized upload is refused before a URL is
     * issued, rather than after the bytes have already crossed the network.
     * Verified against the stored object at completion.
     */
    sizeBytes: z.coerce.number().int().positive("must be greater than zero"),
    checksumSha256: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/i, "must be a hex sha256 digest")
      .optional(),
  })
  .strict();
export type CreateUploadIntentInput = z.infer<typeof createUploadIntentSchema>;

export const completeUploadSchema = z.object({}).strict();
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

export const listDocumentsSchema = z
  .object({
    status: z
      .enum(["uploaded", "queued", "processing", "parsed", "ready", "failed", "archived"])
      .optional(),
    includeArchived: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
  })
  .strict();
export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>;

/** A new version of an existing document: same document row, new bytes. */
export const createVersionIntentSchema = z
  .object({
    filename,
    mimeType,
    sizeBytes: z.coerce.number().int().positive("must be greater than zero"),
    checksumSha256: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/i, "must be a hex sha256 digest")
      .optional(),
    note: z.string().trim().max(1_000).optional(),
  })
  .strict();
export type CreateVersionIntentInput = z.infer<typeof createVersionIntentSchema>;
