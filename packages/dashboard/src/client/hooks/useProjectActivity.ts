import { useEffect, useState } from "react";
import { getGlobalActivity, getProjectActivity } from "@/lib/api";
import type { ActivityDay } from "@/lib/types";

export function useProjectActivity(projectId: string | "global", days: number) {
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetch =
      projectId === "global" ? getGlobalActivity(days) : getProjectActivity(projectId, days);
    fetch
      .then((data) => {
        if (!cancelled) setActivity(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, days]);

  return { activity, loading };
}
