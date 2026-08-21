import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import type { KnowledgeSource } from "@/types";

export async function fetchKnowledgeSources(): Promise<KnowledgeSource[]> {
  const { items } = await apiRequest<{ items: KnowledgeSource[] }>("/api/knowledge");
  return items;
}

export async function fetchKnowledgeSource(id: string): Promise<KnowledgeSource> {
  return apiRequest<KnowledgeSource>(`/api/knowledge/${id}`);
}

export const knowledgeSourcesQueryOptions = () =>
  queryOptions({ queryKey: ["knowledge"], queryFn: fetchKnowledgeSources });

export const knowledgeSourceQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["knowledge", id], queryFn: () => fetchKnowledgeSource(id) });
