import { ShieldCheck } from "lucide-react";

export function SecurityTab() {
  return (
    <div className="max-w-xl space-y-3">
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
