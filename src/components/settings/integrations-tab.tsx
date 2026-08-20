import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plug } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { integrationsQueryOptions } from "@/lib/api/settings";

export function IntegrationsTab() {
  const { data } = useSuspenseQuery(integrationsQueryOptions());
  const [local, setLocal] = useState(data);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {local.map((integration) => (
        <div key={integration.id} className="surface-panel space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Plug className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{integration.name}</p>
                <p className="text-xs text-muted-foreground">{integration.category}</p>
              </div>
            </div>
            <Switch
              checked={integration.connected}
              onCheckedChange={(v) =>
                setLocal((prev) =>
                  prev.map((i) => (i.id === integration.id ? { ...i, connected: v } : i)),
                )
              }
              aria-label={`Toggle ${integration.name}`}
            />
          </div>
          <p className="text-xs text-muted-foreground">{integration.description}</p>
          <p className="text-[11px] text-muted-foreground/70">
            {integration.connected
              ? `Last synced ${integration.lastSynced ? new Date(integration.lastSynced).toLocaleString("en-US") : "just now"}`
              : "Not connected"}
          </p>
        </div>
      ))}
    </div>
  );
}
