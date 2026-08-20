import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { notificationPreferencesQueryOptions } from "@/lib/api/settings";

export function NotificationsTab() {
  const { data } = useSuspenseQuery(notificationPreferencesQueryOptions());
  const [local, setLocal] = useState(data);

  function toggle(id: string, key: "email" | "inApp" | "digest") {
    setLocal((prev) => prev.map((p) => (p.id === id ? { ...p, [key]: !p[key] } : p)));
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Notification</th>
            <th className="px-4 py-2.5 font-medium">Email</th>
            <th className="px-4 py-2.5 font-medium">In-app</th>
            <th className="px-4 py-2.5 font-medium">Digest</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {local.map((pref) => (
            <tr key={pref.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">{pref.label}</p>
                <p className="text-xs text-muted-foreground">{pref.category}</p>
              </td>
              <td className="px-4 py-3">
                <Switch checked={pref.email} onCheckedChange={() => toggle(pref.id, "email")} />
              </td>
              <td className="px-4 py-3">
                <Switch checked={pref.inApp} onCheckedChange={() => toggle(pref.id, "inApp")} />
              </td>
              <td className="px-4 py-3">
                <Switch checked={pref.digest} onCheckedChange={() => toggle(pref.id, "digest")} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
