import { Badge } from "@/components/ui/badge";
import type { ActivityEvent, ActivityEventType } from "@/lib/types";

interface ActivityEventRowProps {
  event: ActivityEvent;
}

const EVENT_LABEL: Record<ActivityEventType, string> = {
  "memory.created": "Created",
  "memory.updated": "Updated",
  "memory.deleted": "Deleted",
  "memory.flagged": "Flagged",
  "memory.queried": "Queried",
};

const EVENT_VARIANT: Record<
  ActivityEventType,
  "default" | "destructive" | "stale" | "secondary" | "outline"
> = {
  "memory.created": "default",
  "memory.updated": "secondary",
  "memory.deleted": "destructive",
  "memory.flagged": "stale",
  "memory.queried": "outline",
};

function formatSummary(event: ActivityEvent): string {
  switch (event.eventType) {
    case "memory.created":
      return "Memory saved";
    case "memory.updated":
      return "Memory updated";
    case "memory.deleted":
      return "Memory deleted";
    case "memory.flagged": {
      const sim = event.payload.similarity;
      return typeof sim === "number"
        ? `Flagged for review — ${Math.round(sim * 100)}% similar`
        : "Flagged for review";
    }
    case "memory.queried": {
      const count = event.payload.resultCount;
      return typeof count === "number"
        ? `Query returned ${count} result${count === 1 ? "" : "s"}`
        : "Query";
    }
  }
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityEventRow({ event }: ActivityEventRowProps) {
  return (
    <li className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs">
      <Badge variant={EVENT_VARIANT[event.eventType]} className="shrink-0">
        {EVENT_LABEL[event.eventType]}
      </Badge>
      <span className="flex-1 min-w-0 text-foreground truncate">{formatSummary(event)}</span>
      {event.memoryId !== null && (
        <span className="font-mono text-[10px] text-muted-foreground shrink-0 hidden sm:block">
          {event.memoryId.slice(0, 8)}
        </span>
      )}
      <span className="text-[11px] text-muted-foreground shrink-0">
        {formatRelativeTime(event.createdAt)}
      </span>
    </li>
  );
}
