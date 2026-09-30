"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useFirebaseSession } from "../../components/firebase-auth-gate";

export default function VerifyEmailPage() {
  const router = useRouter();
  const session = useFirebaseSession();
  const [busy, setBusy] = useState(false);

  async function continueAfterVerification() {
    setBusy(true);
    try {
      await session?.refresh();
      router.replace("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-10">
      <section className="w-full rounded-[12px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">Email verification required</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Verify your email to continue</h1>
        <p className="mt-3 text-sm leading-6 text-slate-700">Company setup and employee access are available only to verified accounts. We will use {session?.user?.email ?? "your signed-in email"}.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => void continueAfterVerification()} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Working..." : "Continue"}</button>
        </div>
      </section>
    </main>
  );
}
