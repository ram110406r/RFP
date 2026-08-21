import { useSuspenseQuery } from "@tanstack/react-query";
import { membersQueryOptions } from "@/lib/api/settings";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Badge } from "@/components/ui/badge";
import { getPerson } from "@/lib/session";
import { cn } from "@/lib/utils";

export function MembersTab() {
  const { data: members } = useSuspenseQuery(membersQueryOptions());
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Member</th>
            <th className="px-4 py-2.5 font-medium">Role</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Last active</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {members.map((m) => {
            const person = getPerson(m.personId);
            return (
              <tr key={m.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <PersonAvatar personId={m.personId} />
                    <div>
                      <p className="font-medium text-foreground">{person?.name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.role}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "font-normal",
                      m.status === "active" && "bg-success-soft text-success",
                      m.status === "invited" && "bg-info-soft text-info",
                      m.status === "suspended" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {m.status}
                  </Badge>
                </td>
                <td className="num px-4 py-3 text-xs text-muted-foreground">
                  {new Date(m.lastActive).toLocaleDateString("en-US")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
