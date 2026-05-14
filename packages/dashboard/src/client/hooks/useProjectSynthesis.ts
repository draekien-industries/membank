import { eq, useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useState } from "react";
import { runProjectSynthesis } from "@/lib/api";
import { queryClient, synthesisCollection } from "@/lib/collections";
import type { Project, Synthesis } from "@/lib/types";

export interface ProjectSynthesisState {
  synthesis: Synthesis | null;
  isLoading: boolean;
  isStale: boolean;
  error: string | null;
  run: () => Promise<void>;
}

export function useProjectSynthesis(project: Project): ProjectSynthesisState {
  const [error, setError] = useState<string | null>(null);

  const { data: results = [], isLoading } = useLiveQuery(
    (q) => q.from({ s: synthesisCollection }).where(({ s }) => eq(s.scope, project.scopeHash)),
    [project.scopeHash]
  );
  const synthesis = results[0] ?? null;

  // Poll the collection while synthesis is in-flight
  useEffect(() => {
    if (!synthesis?.inFlightSince) return;
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["syntheses"] });
    }, 3000);
    return () => clearInterval(timer);
  }, [synthesis?.inFlightSince]);

  const run = useCallback(async () => {
    setError(null);
    try {
      await runProjectSynthesis(project.id);
      await queryClient.invalidateQueries({ queryKey: ["syntheses"] });
    } catch {
      setError("Failed to start synthesis");
    }
  }, [project.id]);

  const isStale =
    synthesis !== null &&
    synthesis.inFlightSince === null &&
    new Date(synthesis.expiresAt) < new Date();

  return { synthesis, isLoading, isStale, error, run };
}
