"use client";

import { useRouter } from "next/navigation";
import { reload, sendEmailVerification } from "firebase/auth";
import { useState } from "react";

import { useFirebaseSession } from "../../components/firebase-auth-gate";
import { getFirebaseAuth } from "../../lib/firebase";

export default function VerifyEmailPage() {
  const router = useRouter();
  const session = useFirebaseSession();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    setBusy(true);
    try {
      await sendEmailVerification(user);
      setMessage("Verification email sent. Check your inbox and spam folder.");
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterVerification() {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    setBusy(true);
    try {
      await reload(user);
      if (getFirebaseAuth().currentUser?.emailVerified) router.replace("/");
      else setMessage("Your email is not verified yet. Open the verification link, then try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-10">
      <section className="w-full rounded-[12px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">Email verification required</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Verify your email to continue</h1>
        <p className="mt-3 text-sm leading-6 text-slate-700">Company setup and employee access are available only to verified Firebase accounts. We will use {session?.user?.email ?? "your signed-in email"}.</p>
        {message ? <p className="mt-4 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-900">{message}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => void resend()} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Working..." : "Resend verification"}</button>
          <button type="button" disabled={busy} onClick={() => void continueAfterVerification()} className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60">I verified my email</button>
        </div>
      </section>
    </main>
  );
}
