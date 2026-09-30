"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { dismissToast, useToasts, type ToastTone } from "../lib/toast";

const TONE_STYLES: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-[var(--success,#067647)]" },
  error: { icon: AlertCircle, className: "text-[var(--danger,#b42318)]" },
  info: { icon: Info, className: "text-[var(--primary)]" },
};

/**
 * Renders toasts from lib/toast. Errors use role="alert" so screen readers
 * announce them immediately; confirmations use a polite status region.
 */
export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6">
      {toasts.map((toast) => {
        const { icon: Icon, className } = TONE_STYLES[toast.tone];
        return (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            aria-live={toast.tone === "error" ? "assertive" : "polite"}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-3 shadow-lg"
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--text)]">{toast.title}</p>
              {toast.description ? <p className="mt-0.5 text-[12px] leading-5 text-[var(--muted)]">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="rounded p-0.5 text-[var(--muted)] hover:text-[var(--text)]"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
