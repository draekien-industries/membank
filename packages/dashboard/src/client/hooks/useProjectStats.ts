import { useEffect, useState } from "react";
import { getProjectStats } from "@/lib/api";
import type { ProjectStats } from "@/lib/types";

export function useProjectStats(projectId: string | null) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    getProjectStats(projectId)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [projectId]);

  return { stats, loading };
}
