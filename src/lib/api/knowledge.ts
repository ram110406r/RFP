import { queryOptions } from "@tanstack/react-query";
import { knowledgeSources, getKnowledgeSource } from "@/data/knowledge";
import { delay, ApiNotFoundError } from "./client";
import type { KnowledgeSource } from "@/types";

export async function fetchKnowledgeSources(): Promise<KnowledgeSource[]> {
  return delay(knowledgeSources);
}

export async function fetchKnowledgeSource(id: string): Promise<KnowledgeSource> {
  const source = getKnowledgeSource(id);
  if (!source) throw new ApiNotFoundError("Knowledge source", id);
  return delay(source);
}

export const knowledgeSourcesQueryOptions = () =>
  queryOptions({ queryKey: ["knowledge"], queryFn: fetchKnowledgeSources });

export const knowledgeSourceQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["knowledge", id], queryFn: () => fetchKnowledgeSource(id) });
