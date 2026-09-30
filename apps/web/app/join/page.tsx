"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { acceptOnboardingInvitationToken } from "../../lib/api";

/**
 * localStorage, not sessionStorage: the verification email may open in a new
 * tab, and that tab has to find the token to finish joining.
 */
const INVITATION_TOKEN_KEY = "tendyy.invitation-token";

export default function JoinPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("token");
    const nextToken = fromHash || window.localStorage.getItem(INVITATION_TOKEN_KEY);
    if (fromHash) {
      window.localStorage.setItem(INVITATION_TOKEN_KEY, fromHash);
      window.history.replaceState(null, "", "/join");
    }
    setToken(nextToken);
  }, []);

  const accept = useMutation({
    mutationFn: (invitationToken: string) => acceptOnboardingInvitationToken(invitationToken),
    onSuccess: async () => {
      window.localStorage.removeItem(INVITATION_TOKEN_KEY);
      await queryClient.invalidateQueries({ queryKey: ["onboarding", "status"] });
      router.replace("/onboarding");
    },
  });

  useEffect(() => {
    if (token && !accept.isPending && !accept.isSuccess && !accept.isError) accept.mutate(token);
  }, [accept, token]);

  if (!token) {
    return <JoinStatus title="Invitation link missing" copy="Ask your administrator to send a new workspace invitation link." />;
  }
  if (accept.isError) {
    return <JoinStatus title="This invitation cannot be used" copy={accept.error instanceof Error ? accept.error.message : "Ask your administrator for a new invitation."} />;
  }
  return <JoinStatus title="Joining your workspace" copy="Verifying your invitation and assigning the workspace access selected by your administrator." loading />;
}

function JoinStatus({ title, copy, loading = false }: { title: string; copy: string; loading?: boolean }) {
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-lg items-center justify-center px-4">
      <section className="w-full rounded-[12px] border border-slate-200 bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
        {loading ? <div className="mb-4 h-3 w-3 animate-pulse rounded-full bg-[#155EEF]" aria-hidden="true" /> : null}
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#155EEF]">TENDYY invitation</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{copy}</p>
      </section>
    </div>
  );
}
