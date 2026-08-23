import {
  CheckCircle2,
  FileText,
  MessageSquare,
  Send,
  ShieldAlert,
  Sparkles,
  UserPlus,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "@/types";

const KIND_META: Record<ActivityEntry["kind"], { icon: typeof CheckCircle2; tone: string }> = {
  assigned: { icon: UserPlus, tone: "text-info" },
  approved: { icon: CheckCircle2, tone: "text-success" },
  evidence: { icon: FileText, tone: "text-info" },
  comment: { icon: MessageSquare, tone: "text-muted-foreground" },
  risk: { icon: ShieldAlert, tone: "text-danger" },
  submission: { icon: Send, tone: "text-primary" },
  generated: { icon: Sparkles, tone: "text-primary" },
  rejected: { icon: XCircle, tone: "text-danger" },
};

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // Fixed locale AND fixed timezone: the SSR host and a visiting browser can
  // disagree on the default ICU locale (Node's process locale vs.
  // navigator.language) and on the local timezone (the container runs UTC,
  // the viewer may not). Either difference formats this text differently on
  // each side and trips a React hydration mismatch (error #418). Pinning both
  // is what makes the output deterministic; the cost is that timestamps read
  // in UTC rather than the viewer's local time.
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function ActivityTimeline({
  entries,
  className,
}: {
  entries: ActivityEntry[];
  className?: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  const sorted = [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <ol className={cn("space-y-4", className)}>
      {sorted.map((entry, i) => {
        const meta = KIND_META[entry.kind];
        const Icon = meta.icon;
        return (
          <li key={entry.id} className="relative flex gap-3 pl-1">
            {i < sorted.length - 1 && (
              <span
                className="absolute left-[15px] top-7 h-[calc(100%-4px)] w-px bg-border"
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted",
                meta.tone,
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 pb-1">
              <p className="text-sm text-foreground">{entry.label}</p>
              <p className="text-xs text-muted-foreground">
                {entry.actor} · {formatTimestamp(entry.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
