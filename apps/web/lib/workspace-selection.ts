"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "tendyy:selected-workspace";
const CHANGE_EVENT = "tendyy:workspace-changed";

function readSelectedWorkspace() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
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
