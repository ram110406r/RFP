import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiKeysQueryOptions } from "@/lib/api/settings";

export function ApiTab() {
  const { data } = useSuspenseQuery(apiKeysQueryOptions());
  const [keys, setKeys] = useState(data);

  function createKey() {
    const n = keys.length + 1;
    setKeys((prev) => [
      {
        id: `key-new-${n}`,
        label: `API Key ${n}`,
        prefix: "sk_live_",
        createdAt: new Date().toISOString().slice(0, 10),
        lastUsed: null,
        scopes: ["read"],
      },
      ...prev,
    ]);
    toast.success("API key created");
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={createKey}>
          <KeyRound className="h-3.5 w-3.5" /> Create API key
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Key</th>
              <th className="px-4 py-2.5 font-medium">Scopes</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium">Last used</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {keys.map((key) => (
              <tr key={key.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{key.label}</p>
                  <p className="num text-xs text-muted-foreground">{key.prefix}••••••••••••</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {key.scopes.map((s) => (
                      <Badge key={s} variant="secondary" className="font-normal">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="num px-4 py-3 text-xs text-muted-foreground">{key.createdAt}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {key.lastUsed ? new Date(key.lastUsed).toLocaleDateString("en-US") : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
