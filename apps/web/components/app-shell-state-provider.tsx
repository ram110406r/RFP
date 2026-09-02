"use client";

import { createContext, type Dispatch, type ReactNode, type SetStateAction, useContext, useEffect, useMemo, useState } from "react";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "tendyy.sidebar-collapsed";
const MOBILE_NAV_STORAGE_KEY = "tendyy.mobile-nav-open";

type AppShellState = {
  sidebarCollapsed: boolean;
  sidebarReady: boolean;
  mobileNavOpen: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  setMobileNavOpen: Dispatch<SetStateAction<boolean>>;
};

const AppShellStateContext = createContext<AppShellState | null>(null);

export function useAppShellState() {
  const value = useContext(AppShellStateContext);
  if (!value) {
    throw new Error("useAppShellState must be used within an AppShellStateProvider");
  }
  return value;
}

export function AppShellStateProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const storedSidebarValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (storedSidebarValue !== null) {
      setSidebarCollapsed(storedSidebarValue === "true");
    }

    setMobileNavOpen(window.sessionStorage.getItem(MOBILE_NAV_STORAGE_KEY) === "true");
    setSidebarReady(true);
  }, []);

  useEffect(() => {
    if (!sidebarReady) {
      return;
    }

    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed, sidebarReady]);

  useEffect(() => {
    if (!sidebarReady) {
      return;
    }

    window.sessionStorage.setItem(MOBILE_NAV_STORAGE_KEY, String(mobileNavOpen));
  }, [mobileNavOpen, sidebarReady]);

  const value = useMemo(
    () => ({
      sidebarCollapsed,
      sidebarReady,
      mobileNavOpen,
      setSidebarCollapsed,
      setMobileNavOpen,
    }),
    [mobileNavOpen, sidebarCollapsed, sidebarReady],
  );

  return <AppShellStateContext.Provider value={value}>{children}</AppShellStateContext.Provider>;
}
