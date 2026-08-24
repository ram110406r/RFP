import { useSuspenseQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { accessSummaryQueryOptions } from "@/lib/api/settings";

export function SecurityTab() {
  const { data: summary } = useSuspenseQuery(accessSummaryQueryOptions());

  return (
    <div className="max-w-xl space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Workspaces" value={summary.workspaces} />
        <SummaryCard label="Custom roles" value={summary.customRoles} />
        <SummaryCard label="Policies" value={summary.policies} />
        <SummaryCard label="Open assignments" value={summary.openAssignments} />
        <SummaryCard label="Activity events" value={summary.activityEvents} />
        <SummaryCard label="Audit events" value={summary.auditEvents} />
      </div>
      <div className="surface-panel flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <div>
          <p className="text-sm font-medium text-foreground">Single sign-on enforced</p>
          <p className="text-xs text-muted-foreground">
            All members authenticate via Okta SSO with SCIM-based provisioning.
          </p>
        </div>
      </div>
      <div className="surface-panel flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Multi-factor authentication required
          </p>
          <p className="text-xs text-muted-foreground">
            Enforced for all accounts with administrative or reviewer permissions.
          </p>
        </div>
      </div>
      <div className="surface-panel flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">Session timeout</p>
          <p className="text-xs text-muted-foreground">
            Idle sessions are revoked after 12 hours of inactivity.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-panel rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
