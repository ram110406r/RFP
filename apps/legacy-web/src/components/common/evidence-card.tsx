import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { ConfidenceMeter } from "./confidence-meter";
import type { Evidence } from "@/types";

function formatFreshness(days: number) {
  if (days <= 30) return `Verified ${days}d ago`;
  if (days <= 90) return `Verified ${Math.round(days / 7)}w ago`;
  return `Verified ${Math.round(days / 30)}mo ago`;
}

export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  return (
    <div className="rounded-lg border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{evidence.title}</p>
          <p className="text-xs text-muted-foreground">{evidence.sourceName}</p>
        </div>
        <ConfidenceMeter value={evidence.confidence} size="sm" showLabel={false} />
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
        &ldquo;{evidence.excerpt}&rdquo;
      </p>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatFreshness(evidence.freshnessDays)}</span>
        <Link
          to="/knowledge/$sourceId"
          params={{ sourceId: evidence.sourceId }}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          View source <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
