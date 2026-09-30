"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny toast store. Module-level rather than React context so mutation
 * hooks (which are not components) can report success and failure without
 * every call site threading a callback through.
 */

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

const DISMISS_AFTER_MS: Record<ToastTone, number> = { success: 3_500, info: 4_500, error: 7_000 };
const MAX_VISIBLE = 4;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function dismissToast(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

export function showToast(tone: ToastTone, title: string, description?: string) {
  const toast: Toast = { id: nextId++, tone, title, description };
  toasts = [...toasts, toast].slice(-MAX_VISIBLE);
  emit();
  if (typeof window !== "undefined") window.setTimeout(() => dismissToast(toast.id), DISMISS_AFTER_MS[tone]);
  return toast.id;
}

export const toast = {
  success: (title: string, description?: string) => showToast("success", title, description),
  error: (title: string, description?: string) => showToast("error", title, description),
  info: (title: string, description?: string) => showToast("info", title, description),
};

const EMPTY: Toast[] = [];

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
    () => EMPTY,
  );
}

/** A readable message from whatever a failed request threw. */
export function errorText(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    const message = (error as { message: string }).message.trim();
    if (message) return message;
  }
  return fallback;
}
