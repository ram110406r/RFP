import { headers } from "next/headers";

import { fetchWorkspaceOverview } from "../../../../lib/api";
import { RequirementsIndexClient } from "../../../../components/tender-workspace";

async function loadOverview(tenderId: string) {
  const requestHeaders = new Headers();
  const cookie = (await headers()).get("cookie");
  if (cookie) requestHeaders.set("cookie", cookie);

  try {
    return await fetchWorkspaceOverview(tenderId, { cookie, headers: requestHeaders });
  } catch {
    return null;
  }
}

export default async function RequirementsIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const overview = await loadOverview(id);
  return <RequirementsIndexClient tenderId={id} initialOverview={overview} />;
}
