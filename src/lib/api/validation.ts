import { queryOptions } from "@tanstack/react-query";
import { getValidationSnapshot, type ValidationSnapshot } from "@/data/validation";
import { delay } from "./client";

export async function fetchValidationSnapshot(rfpId: string): Promise<ValidationSnapshot> {
  return delay(getValidationSnapshot(rfpId));
}

export const validationSnapshotQueryOptions = (rfpId: string) =>
  queryOptions({ queryKey: ["validation", rfpId], queryFn: () => fetchValidationSnapshot(rfpId) });

export type { ValidationSnapshot };
