import { useEffect, useState } from "react";
import { getProjectStats } from "@/lib/api";
import type { ProjectStats } from "@/lib/types";

export function useProjectStats(projectId: string | null) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    getProjectStats(projectId)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { stats, loading };
}
