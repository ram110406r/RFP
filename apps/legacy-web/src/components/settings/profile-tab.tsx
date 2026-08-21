import { useState } from "react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/common/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPerson, CURRENT_USER_ID } from "@/lib/session";

export function ProfileTab() {
  const me = getPerson(CURRENT_USER_ID);
  const [name, setName] = useState(me?.name ?? "");
  const [email, setEmail] = useState("priya.nair@halcyonsystems.com");

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <PersonAvatar personId={CURRENT_USER_ID} className="h-14 w-14 text-base" />
        <div>
          <p className="text-sm font-semibold text-foreground">{me?.name}</p>
          <p className="text-xs text-muted-foreground">
            {me?.role} · {me?.team}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Full name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      </div>
      <div className="space-y-1.5">
        <Label>Team</Label>
        <Input defaultValue={me?.team} disabled />
      </div>
      <Button size="sm" onClick={() => toast.success("Profile updated")}>
        Save changes
      </Button>
    </div>
  );
}
