"use client";

import { useEffect, useState } from "react";

import { getApiBaseUrl } from "../../lib/api";

/** Written by /join so an invitation survives the trip through the inbox. */
const INVITATION_TOKEN_KEY = "tendyy.invitation-token";

/**
 * Where an emailed set-password link lands (sign-up, "forgot password", or an
 * account that was never finished). Runs outside AuthGate: the person has no
 * session yet, and completing this is how they get one.
 *
 * The token travels in the URL fragment, which browsers never send to a
 * server or put in logs, and is stripped from the address bar immediately.
 */
export default function SetPasswordPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const readToken = () => {
      const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (fromHash) {
        window.history.replaceState(null, "", "/set-password");
        setToken(fromHash);
        setError(null);
      } else {
        setToken((current) => current ?? null);
      }
    };
    readToken();
    // Opening the link in a tab already on this page only changes the hash.
    window.addEventListener("hashchange", readToken);
    return () => window.removeEventListener("hashchange", readToken);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (password !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl().replace(/\/$/, "")}/api/v1/auth/email-link/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
        throw new Error(body?.error?.message ?? body?.message ?? "Could not set your password.");
      }
      // A full navigation, so AuthGate starts again with the new session.
      let pendingInvitation: string | null = null;
      try {
        pendingInvitation = window.localStorage.getItem(INVITATION_TOKEN_KEY);
      } catch {
        pendingInvitation = null;
      }
      window.location.assign(pendingInvitation ? "/join" : "/onboarding");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not set your password.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-deep)] px-4 py-10">
      <section className="w-full max-w-md rounded-[12px] border border-slate-200 bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#155EEF]">TENDYY account</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Set your password</h1>

        {token === undefined ? null : !token ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-6 text-slate-600">This page needs the link from your email. Open the most recent email from TENDYY, or request a new link.</p>
            <a href="/login" className="inline-flex rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white">Go to sign in</a>
          </div>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <p className="text-sm leading-6 text-slate-600">Choose a password of at least 12 characters. This signs out any other session on this account.</p>
            <label className="block text-sm font-medium text-slate-700">
              New password
              <input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-950 outline-none focus:border-[#155EEF]" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Confirm password
              <input type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-slate-950 outline-none focus:border-[#155EEF]" />
            </label>
            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                {error} <a href="/login" className="font-semibold underline">Back to sign in</a>
              </div>
            ) : null}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-[#155EEF] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Saving..." : "Set password and continue"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
