import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { aiSettingsQueryOptions } from "@/lib/api/settings";
import type { AiSetting } from "@/types";

export function TogglesTab({
  queryOptions,
}: {
  queryOptions: () => ReturnType<typeof aiSettingsQueryOptions>;
}) {
  const { data } = useSuspenseQuery(queryOptions());
  const [local, setLocal] = useState<AiSetting[]>(data);

  function update(id: string, value: boolean | number | string) {
    setLocal((prev) => prev.map((item) => (item.id === id ? { ...item, value } : item)));
  }

  return (
    <div className="max-w-xl divide-y surface-panel p-0">
      {local.map((setting) => (
        <div key={setting.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{setting.label}</p>
            <p className="text-xs text-muted-foreground">{setting.description}</p>
          </div>
          <div className="w-32 shrink-0">
            {setting.kind === "toggle" && (
              <div className="flex justify-end">
                <Switch
                  checked={Boolean(setting.value)}
                  onCheckedChange={(v) => update(setting.id, v)}
                  aria-label={setting.label}
                />
              </div>
            )}
            {setting.kind === "slider" && (
              <div className="flex items-center gap-2">
                <Slider
                  value={[Number(setting.value)]}
                  min={0}
                  max={setting.max ?? 100}
                  step={5}
                  onValueChange={([v]) => update(setting.id, v ?? 0)}
                />
                <span className="num w-8 text-right text-xs text-muted-foreground">
                  {setting.value}
                </span>
              </div>
            )}
            {setting.kind === "select" && (
              <Select value={String(setting.value)} onValueChange={(v) => update(setting.id, v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {setting.options?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
