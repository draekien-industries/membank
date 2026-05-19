import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getSynthesisHistory, revertSynthesisToVersion } from "@/lib/api";
import { queryClient } from "@/lib/collections";
import type { SynthesisVersion } from "@/lib/types";

export function useSynthesisHistory(projectId: string) {
  const [versions, setVersions] = useState<SynthesisVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getSynthesisHistory(projectId)
      .then((v) => {
        if (!cancelled) setVersions(v);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load synthesis history");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const revert = async (version: number): Promise<boolean> => {
    setReverting(true);
    try {
      await revertSynthesisToVersion(projectId, version);
      await queryClient.invalidateQueries({ queryKey: ["syntheses"] });
      const updated = await getSynthesisHistory(projectId);
      setVersions(updated);
      return true;
    } catch {
      toast.error("Failed to revert synthesis — try again");
      return false;
    } finally {
      setReverting(false);
    }
  };

  return { versions, isLoading, reverting, revert };
}
