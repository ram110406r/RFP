"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "tendyy:selected-workspace";
const CHANGE_EVENT = "tendyy:workspace-changed";

export interface WorkspaceSelectionOption {
  id: string;
  status?: string;
}

function readSelectedWorkspace() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function resolveSelectedWorkspaceId(
  selectedWorkspaceId: string | null | undefined,
  workspaces: readonly WorkspaceSelectionOption[],
) {
  const activeWorkspaces = workspaces.filter((workspace) => workspace.status === undefined || workspace.status === "active");
  if (selectedWorkspaceId && activeWorkspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
    return selectedWorkspaceId;
  }
  return activeWorkspaces[0]?.id ?? null;
}

export function useSelectedWorkspaceId() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(readSelectedWorkspace);

  useEffect(() => {
    const sync = () => setWorkspaceId(readSelectedWorkspace());
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  return workspaceId;
}

export function selectWorkspace(workspaceId: string | null) {
  if (typeof window === "undefined") return;
  if (workspaceId) window.localStorage.setItem(STORAGE_KEY, workspaceId);
  else window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
