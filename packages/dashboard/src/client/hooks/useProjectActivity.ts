import { useEffect, useState } from "react";
import { getGlobalActivity, getProjectActivity } from "@/lib/api";
import type { ActivityDay } from "@/lib/types";

export function useProjectActivity(projectId: string | "global", days: number) {
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const fetch =
      projectId === "global" ? getGlobalActivity(days) : getProjectActivity(projectId, days);
    fetch.then(setActivity).finally(() => setLoading(false));
  }, [projectId, days]);

  return { activity, loading };
}
