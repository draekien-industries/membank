import { useMemo } from "react";
import { Empty, EmptyTitle } from "@/components/ui/empty";
import { useActivityEvents } from "@/hooks/useActivityEvents";
import type { ActivityEvent } from "@/lib/types";
import { ActivityEventRow } from "./ActivityEventRow";

interface ActivityTimelineProps {
  scope?: string;
}

function groupByDay(events: ActivityEvent[]): { day: string; events: ActivityEvent[] }[] {
  const map = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const day = e.createdAt.slice(0, 10);
    const bucket = map.get(day);
    if (bucket !== undefined) {
      bucket.push(e);
    } else {
      map.set(day, [e]);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, dayEvents]) => ({ day, events: dayEvents }));
}

function formatDayHeading(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (iso === today) return "Today";
  if (iso === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ActivityTimeline({ scope }: ActivityTimelineProps) {
  const { events, loading } = useActivityEvents({ scope, limit: 200 });
  const groups = useMemo(() => groupByDay(events), [events]);

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs font-mono text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <Empty className="border-0 rounded-none p-0 h-32">
        <EmptyTitle className="text-xs font-mono font-normal">No activity yet</EmptyTitle>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {groups.map(({ day, events: dayEvents }) => (
          <section key={day}>
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 py-1.5 border-b border-border">
              <span className="text-[11px] font-mono text-muted-foreground">
                {formatDayHeading(day)}
              </span>
            </div>
            <ul className="m-0 p-0">
              {dayEvents.map((e) => (
                <ActivityEventRow key={e.id} event={e} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="px-4 py-2 border-t border-border shrink-0 text-[11px] font-mono text-muted-foreground">
        {events.length} {events.length === 1 ? "event" : "events"}
      </div>
    </div>
  );
}
