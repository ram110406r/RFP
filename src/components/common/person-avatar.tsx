import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getPerson } from "@/data/people";

export function PersonAvatar({
  personId,
  className,
}: {
  personId: string | null | undefined;
  className?: string;
}) {
  const person = getPerson(personId);
  return (
    <Avatar className={cn("h-6 w-6", className)}>
      <AvatarFallback className="bg-accent text-[10px] font-semibold text-accent-foreground">
        {person?.initials ?? "?"}
      </AvatarFallback>
    </Avatar>
  );
}
