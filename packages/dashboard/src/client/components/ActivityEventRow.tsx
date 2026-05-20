import { CaretRight } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { AppLink } from "@/components/AppLink";
import type { BadgeVariant } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import type { ActivityEvent, ActivityEventType, MemoryType } from "@/lib/types";
import { MEMORY_TYPES } from "@/lib/types";
import { cn } from "@/lib/utils";

type ActivityEventRowProps = {
  event: ActivityEvent;
  projectId?: string;
};

const EVENT_LABEL: Record<ActivityEventType, string> = {
  "memory.created": "Created",
  "memory.updated": "Updated",
  "memory.deleted": "Deleted",
  "memory.flagged": "Flagged",
  "memory.queried": "Queried",
};

const EVENT_VARIANT: Record<ActivityEventType, BadgeVariant> = {
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

const contentPayloadSchema = z.object({
  contentSnapshot: z.string(),
  memoryType: z.enum(MEMORY_TYPES).optional(),
});

const queryPayloadSchema = z.object({
  query: z.string().optional(),
  resultCount: z.number().optional(),
  topScores: z.array(z.number()).optional(),
});

const flaggedPayloadSchema = z.object({
  similarity: z.number(),
  conflictingMemoryId: z.string().optional(),
  conflictSnapshot: z.string().optional(),
});

type ContentDetail = {
  kind: "content";
  contentSnapshot: string;
  memoryType: MemoryType | undefined;
};

type QueryDetail = {
  kind: "query";
  query: string | undefined;
  resultCount: number | undefined;
  topScores: number[] | undefined;
};

type FlaggedDetail = {
  kind: "flagged";
  similarity: number;
  conflictingMemoryId: string | undefined;
  conflictSnapshot: string | undefined;
};

type EventDetail = ContentDetail | QueryDetail | FlaggedDetail;

function extractDetail(event: ActivityEvent): EventDetail | null {
  const p = event.payload;
  switch (event.eventType) {
    case "memory.created":
    case "memory.updated":
    case "memory.deleted": {
      const result = contentPayloadSchema.safeParse(p);
      if (!result.success) return null;
      return { kind: "content", ...result.data };
    }
    case "memory.queried": {
      const result = queryPayloadSchema.safeParse(p);
      if (!result.success) return null;
      const { query, resultCount, topScores } = result.data;
      if (query === undefined && resultCount === undefined) return null;
      return { kind: "query", query, resultCount, topScores };
    }
    case "memory.flagged": {
      const result = flaggedPayloadSchema.safeParse(p);
      if (!result.success) return null;
      return { kind: "flagged", ...result.data };
    }
  }
}

type DetailBlockProps = {
  detail: EventDetail;
  event: ActivityEvent;
  projectId: string | undefined;
};

function MemoryLink({
  memoryId,
  projectId,
  className,
}: {
  memoryId: string;
  projectId: string;
  className?: string;
}) {
  return (
    <AppLink
      to="/$projectId/$memoryId"
      params={{ projectId, memoryId }}
      className={cn("text-primary/80 hover:text-primary transition-colors", className)}
    >
      view memory →
    </AppLink>
  );
}

function DetailBlock({ detail, event, projectId }: DetailBlockProps) {
  if (detail.kind === "content") {
    return (
      <div className="space-y-1.5">
        {detail.memoryType !== undefined && (
          <Badge variant={detail.memoryType} className="text-[9px]">
            {detail.memoryType}
          </Badge>
        )}
        <p className="text-[11px] font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
          {detail.contentSnapshot}
        </p>
        {projectId !== undefined &&
          event.memoryId !== null &&
          event.eventType !== "memory.deleted" && (
            <MemoryLink
              memoryId={event.memoryId}
              projectId={projectId}
              className="text-[10px] font-mono"
            />
          )}
      </div>
    );
  }

  if (detail.kind === "query") {
    return (
      <div className="space-y-1.5">
        {detail.query !== undefined && (
          <p className="text-[11px] font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
            &ldquo;{detail.query}&rdquo;
          </p>
        )}
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
          {detail.resultCount !== undefined && (
            <span>
              {detail.resultCount} result{detail.resultCount === 1 ? "" : "s"}
            </span>
          )}
          {detail.topScores !== undefined && detail.topScores.length > 0 && (
            <span>scores: {detail.topScores.map((s) => s.toFixed(2)).join(" · ")}</span>
          )}
        </div>
      </div>
    );
  }

  // flagged
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-mono text-muted-foreground">
        {Math.round(detail.similarity * 100)}% similar
        {detail.conflictingMemoryId !== undefined && (
          <span className="ml-2 text-foreground/60">
            conflict: {detail.conflictingMemoryId.slice(0, 8)}
          </span>
        )}
      </div>
      {detail.conflictSnapshot !== undefined && (
        <p className="text-[11px] font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
          {detail.conflictSnapshot}
        </p>
      )}
      <div className="flex gap-3 text-[10px] font-mono">
        {projectId !== undefined && event.memoryId !== null && (
          <MemoryLink memoryId={event.memoryId} projectId={projectId} />
        )}
        {projectId !== undefined && detail.conflictingMemoryId !== undefined && (
          <AppLink
            to="/$projectId/$memoryId"
            params={{ projectId, memoryId: detail.conflictingMemoryId }}
            className="text-stale/80 hover:text-stale transition-colors"
          >
            view conflict →
          </AppLink>
        )}
      </div>
    </div>
  );
}

export function ActivityEventRow({ event, projectId }: ActivityEventRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const detail = useMemo(() => extractDetail(event), [event]);
  const hasDetail = detail !== null;

  function toggle() {
    setIsOpen((prev) => !prev);
  }

  return (
    <li className="border-b border-border">
      <div
        {...(hasDetail && {
          role: "button" as const,
          tabIndex: 0,
          onClick: toggle,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          },
        })}
        className={cn(
          "flex items-center gap-2 px-4 py-3 text-xs",
          hasDetail && "cursor-pointer hover:bg-accent/40",
          isOpen && "bg-accent/20"
        )}
      >
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
        {hasDetail && (
          <CaretRight
            size={12}
            className={cn(
              "shrink-0 text-muted-foreground/40 transition-transform",
              isOpen && "rotate-90"
            )}
          />
        )}
      </div>
      {isOpen && detail !== null && (
        <div className="px-4 py-2.5 bg-muted/30 border-t border-border/50">
          <DetailBlock detail={detail} event={event} projectId={projectId} />
        </div>
      )}
    </li>
  );
}
