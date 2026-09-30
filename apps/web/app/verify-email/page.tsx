"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuthSession } from "../../components/auth-gate";
import { getApiBaseUrl } from "../../lib/api";

export default function VerifyEmailPage() {
  const router = useRouter();
  const session = useAuthSession();
  const [busy, setBusy] = useState<"resend" | "continue" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const email = session?.user?.email ?? null;

  async function resend() {
    if (!email) return;
    setBusy("resend");
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl().replace(/\/$/, "")}/api/auth/send-verification-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, callbackURL: `${window.location.origin}/onboarding` }),
      });
      if (!response.ok) throw new Error("Could not send the verification email. Try again shortly.");
      setNotice(`A link to set your password was sent to ${email}.`);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Could not send the verification email.");
    } finally {
      setBusy(null);
    }
  }

  async function continueAfterVerification() {
    setBusy("continue");
    try {
      await session?.refresh();
      router.replace("/");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-10">
      <section className="w-full rounded-[12px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">Email verification required</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Verify your email to continue</h1>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Company setup and employee access are available only to verified accounts. Open the link we emailed to{" "}
          <strong className="text-slate-950">{email ?? "your email address"}</strong>, then continue.
        </p>
        {notice ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{notice}</p> : null}
        {error ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={busy !== null || !email} onClick={() => void resend()} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy === "resend" ? "Sending..." : "Resend email"}</button>
          <button type="button" disabled={busy !== null} onClick={() => void continueAfterVerification()} className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-60">{busy === "continue" ? "Checking..." : "I've verified, continue"}</button>
        </div>
      </section>
    </main>
  );
}
