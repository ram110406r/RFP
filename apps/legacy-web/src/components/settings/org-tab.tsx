import { useSuspenseQuery } from "@tanstack/react-query";
import { orgProfileQueryOptions } from "@/lib/api/settings";

export function OrgTab() {
  const { data: org } = useSuspenseQuery(orgProfileQueryOptions());
  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-sm font-bold text-primary">
          {org.logoInitials}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{org.name}</p>
          <p className="text-xs text-muted-foreground">{org.domain}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="surface-panel p-3.5">
          <p className="text-xs text-muted-foreground">Plan</p>
          <p className="font-medium text-foreground">{org.plan}</p>
        </div>
        <div className="surface-panel p-3.5">
          <p className="text-xs text-muted-foreground">Seats</p>
          <p className="num font-medium text-foreground">
            {org.seatsUsed} / {org.seats}
          </p>
        </div>
        <div className="surface-panel p-3.5 col-span-2">
          <p className="text-xs text-muted-foreground">Industry</p>
          <p className="font-medium text-foreground">{org.industry}</p>
        </div>
      </div>
    </div>
  );
}
