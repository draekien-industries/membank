import { useEffect, useState } from "react";
import { getActivityEvents } from "@/lib/api";
import type { ActivityEvent, ActivityEventFilter } from "@/lib/types";

export function useActivityEvents(filter: ActivityEventFilter): {
  events: ActivityEvent[];
  loading: boolean;
} {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const { scope, type, since, limit } = filter;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getActivityEvents({ scope, type, since, limit })
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, type, since, limit]);

  return { events, loading };
}
