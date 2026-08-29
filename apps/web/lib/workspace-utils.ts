export function reviewToneFromStatus(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "APPROVED") return "success";
  if (status === "CHANGES_REQUESTED") return "warning";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

export function getGenerationMeta(payload: { metadata: Record<string, unknown> }) {
  const metadata = payload.metadata as Record<string, unknown> | undefined;
  const generation = metadata && typeof metadata.generation === "object" && metadata.generation !== null ? metadata.generation : null;
  return generation as { generatedAt?: string; generationId?: string } | null;
}

export function getGenerationId(metadata: Record<string, unknown> | null | undefined) {
  const generation = metadata && typeof metadata.generation === "object" && metadata.generation !== null ? metadata.generation : null;
  if (!generation) return null;
  const generationId = (generation as { generationId?: string }).generationId;
  return typeof generationId === "string" ? generationId : null;
}
