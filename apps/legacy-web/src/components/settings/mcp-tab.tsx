import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { mcpConnectionsQueryOptions } from "@/lib/api/settings";
import { cn } from "@/lib/utils";

export function McpTab() {
  const { data: connections } = useSuspenseQuery(mcpConnectionsQueryOptions());
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-xs text-muted-foreground">
        Model Context Protocol connections are configured and run on the backend. This view reflects
        their current status only.
      </p>
      <div className="space-y-2.5">
        {connections.map((mcp) => (
          <div key={mcp.id} className="surface-panel flex items-start justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{mcp.name}</p>
                <Badge variant="secondary" className="font-normal uppercase">
                  {mcp.transport}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{mcp.description}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {mcp.toolsExposed} tools exposed
              </p>
            </div>
            <Badge
              className={cn(
                "shrink-0 font-normal",
                mcp.status === "connected" && "bg-success-soft text-success",
                mcp.status === "disconnected" && "bg-muted text-muted-foreground",
                mcp.status === "error" && "bg-danger-soft text-danger",
              )}
              variant="secondary"
            >
              {mcp.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
