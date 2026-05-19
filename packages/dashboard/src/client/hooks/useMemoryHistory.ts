import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getMemoryHistory, revertMemoryToVersion } from "@/lib/api";
import { queryClient } from "@/lib/collections";
import type { MemoryVersion } from "@/lib/types";

export function useMemoryHistory(memoryId: string) {
  const [versions, setVersions] = useState<MemoryVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getMemoryHistory(memoryId)
      .then((v) => {
        if (!cancelled) setVersions(v);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load history");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memoryId]);

  const revert = async (version: number): Promise<boolean> => {
    setReverting(true);
    try {
      await revertMemoryToVersion(memoryId, version);
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
      const updated = await getMemoryHistory(memoryId);
      setVersions(updated);
      return true;
    } catch {
      toast.error("Failed to revert — try again");
      return false;
    } finally {
      setReverting(false);
    }
  };

  return { versions, isLoading, reverting, revert };
}
