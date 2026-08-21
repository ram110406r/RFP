import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type { Rfp, RfpDocument } from "@/types";

interface RfpListResponse {
  items: Rfp[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// The requirements/reviews/knowledge/analytics pages, and this app's tables,
// still filter/sort/paginate client-side (see requirement-table.tsx and
// rfps/index.tsx) — so list fetches ask the server for a large page rather
// than the default 25, to preserve that existing behavior unchanged. A true
// server-side-paginated table is future work, not part of this migration.
const LIST_ALL_LIMIT = 200;

export async function fetchRfps(): Promise<Rfp[]> {
  const res = await apiRequest<RfpListResponse>("/api/rfps", { query: { limit: LIST_ALL_LIMIT } });
  return res.items;
}

export async function fetchRfp(id: string): Promise<Rfp> {
  return apiRequest<Rfp>(`/api/rfps/${id}`);
}

export const rfpsQueryOptions = () => queryOptions({ queryKey: ["rfps"], queryFn: fetchRfps });

export const rfpQueryOptions = (rfpId: string) =>
  queryOptions({ queryKey: ["rfps", rfpId], queryFn: () => fetchRfp(rfpId) });

export const MAX_UPLOAD_SIZE_MB = 50;

const EXTENSION_TYPES: Record<string, RfpDocument["type"]> = {
  pdf: "PDF",
  docx: "DOCX",
  xlsx: "XLSX",
  pptx: "PPTX",
  zip: "ZIP",
  html: "HTML",
};

/** Maps a filename's extension to a supported RfpDocument type, or undefined if unsupported. */
export function resolveDocumentType(fileName: string): RfpDocument["type"] | undefined {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension];
}

/**
 * Client-side upload UX simulator: the wizard collects files locally and only
 * sends their metadata (name/type/size) to the server once the RFP is
 * created — see server/.env.example's STORAGE_* vars for wiring real object
 * storage later. This just drives the wizard's uploading/uploaded/failed
 * states with realistic latency; it holds no business data of its own.
 */
export async function simulateDocumentUpload(): Promise<{ status: "uploaded" | "failed" }> {
  const ms = 700 + Math.random() * 900;
  const failed = Math.random() < 0.08;
  return new Promise((resolve) =>
    setTimeout(() => resolve({ status: failed ? "failed" : "uploaded" }), ms),
  );
}

export interface NewRfpInput {
  title: string;
  customer: string;
  opportunity: string;
  estimatedValue: number;
  deadline: string;
  ownerId: string;
  documents: { name: string; type: RfpDocument["type"]; sizeMb: number }[];
  collaboratorIds?: string[];
  asDraft?: boolean;
}

export async function createRfp(input: NewRfpInput): Promise<Rfp> {
  return apiRequest<Rfp>("/api/rfps", { method: "POST", body: input });
}

export interface UpdateRfpInput {
  title?: string;
  opportunity?: string;
  ownerId?: string;
  deadline?: string;
  estimatedValue?: number;
  status?: Rfp["status"];
}

export async function updateRfp(id: string, input: UpdateRfpInput): Promise<Rfp> {
  return apiRequest<Rfp>(`/api/rfps/${id}`, { method: "PATCH", body: input });
}
