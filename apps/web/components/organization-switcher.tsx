"use client";

import { Building2 } from "lucide-react";

import { useActivateOrganization, useAuthMe } from "../lib/queries";

/**
 * Lets a person who belongs to several organizations choose which one they are
 * acting in. The switch is a server-side session change (the API re-checks the
 * membership), after which every cached query is dropped and the page reloads
 * so nothing from the previous tenant stays on screen.
 */
export function OrganizationSwitcher({ className = "" }: { className?: string }) {
  const me = useAuthMe();
  const activate = useActivateOrganization();
  const memberships = me.data?.memberships ?? [];

  if (memberships.length < 2) return null;

  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
        Organization
      </span>
      <select
        aria-label="Switch organization"
        value={me.data?.organizationId ?? ""}
        disabled={activate.isPending}
        onChange={(event) => {
          const organizationId = event.target.value;
          if (!organizationId || organizationId === me.data?.organizationId) return;
          activate.mutate(organizationId, { onSuccess: () => window.location.assign("/") });
        }}
        className="w-full min-w-0 truncate rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px] font-medium text-slate-800 disabled:opacity-60"
      >
        {memberships.map((membership) => (
          <option key={membership.organizationId} value={membership.organizationId}>
            {membership.organizationName}
          </option>
        ))}
      </select>
      {activate.isError ? (
        <span className="mt-1 block text-[11px] text-rose-700" role="alert">
          Could not switch organization.
        </span>
      ) : null}
    </label>
  );
}
