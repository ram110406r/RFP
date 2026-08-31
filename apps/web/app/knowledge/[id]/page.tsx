import { headers } from "next/headers";

import { KnowledgeDetailClient } from "../../../components/knowledge-workspace";
import { fetchKnowledgeItem } from "../../../lib/api";

async function loadKnowledge(id: string) {
  const requestHeaders = new Headers();
  const cookie = (await headers()).get("cookie");
  if (cookie) requestHeaders.set("cookie", cookie);

  try {
    return await fetchKnowledgeItem(id, { cookie, headers: requestHeaders });
  } catch {
    return null;
  }
}

export default async function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await loadKnowledge(id);
  return <KnowledgeDetailClient knowledgeId={id} initialItem={item} />;
}
