import { headers } from "next/headers";

import { TenderWorkspaceClient } from "../../../components/tender-workspace";
import { fetchWorkspaceOverview } from "../../../lib/api";

async function loadOverview(tenderId: string) {
  const cookie = (await headers()).get("cookie");
  try {
    return await fetchWorkspaceOverview(tenderId, { cookie: cookie ?? undefined });
  } catch {
    return null;
  }
}

export default async function ApplyWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const overview = await loadOverview(id);
  return <TenderWorkspaceClient tenderId={id} initialOverview={overview} />;
}
