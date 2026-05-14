import { eq, useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useState } from "react";
import { resetProjectSynthesis, runProjectSynthesis } from "@/lib/api";
import { queryClient, synthesisCollection } from "@/lib/collections";
import type { Project, Synthesis } from "@/lib/types";

const IN_FLIGHT_STUCK_MS = 60_000;

export interface ProjectSynthesisState {
  synthesis: Synthesis | null;
  isLoading: boolean;
  isStale: boolean;
  isStuck: boolean;
  error: string | null;
  run: () => Promise<void>;
  reset: () => Promise<void>;
}

export function useProjectSynthesis(project: Project): ProjectSynthesisState {
  const [error, setError] = useState<string | null>(null);
  const [isStuck, setIsStuck] = useState(false);

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

  useEffect(() => {
    if (!synthesis?.inFlightSince) {
      setIsStuck(false);
      return;
    }
    const elapsed = Date.now() - new Date(synthesis.inFlightSince).getTime();
    const remaining = IN_FLIGHT_STUCK_MS - elapsed;
    if (remaining <= 0) {
      setIsStuck(true);
      return;
    }
    const timer = setTimeout(() => setIsStuck(true), remaining);
    return () => clearTimeout(timer);
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

  const reset = useCallback(async () => {
    setError(null);
    setIsStuck(false);
    try {
      await resetProjectSynthesis(project.id);
      await queryClient.invalidateQueries({ queryKey: ["syntheses"] });
    } catch {
      setError("Failed to reset synthesis");
    }
  }, [project.id]);

  const isStale =
    synthesis !== null &&
    synthesis.inFlightSince === null &&
    new Date(synthesis.expiresAt) < new Date();

  return { synthesis, isLoading, isStale, isStuck, error, run, reset };
}
