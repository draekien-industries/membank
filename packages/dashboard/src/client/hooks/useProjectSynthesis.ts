import { eq, useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resetProjectSynthesis, runProjectSynthesis } from "@/lib/api";
import { queryClient, synthesisCollection } from "@/lib/collections";
import type { Project, Synthesis } from "@/lib/types";

const IN_FLIGHT_STUCK_MS = 60_000;

function isStaleSynthesis(synthesis: Synthesis): boolean {
  return synthesis.inFlightSince === null && new Date(synthesis.expiresAt) < new Date();
}

export interface ProjectSynthesisState {
  syntheses: Synthesis[];
  representative: Synthesis | null;
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

  const { data: syntheses = [], isLoading } = useLiveQuery(
    (q) => q.from({ s: synthesisCollection }).where(({ s }) => eq(s.scope, project.scopeHash)),
    [project.scopeHash]
  );

  const representative = useMemo(
    () =>
      syntheses.reduce<Synthesis | null>(
        (latest, s) => (latest === null || s.synthesizedAt > latest.synthesizedAt ? s : latest),
        null
      ),
    [syntheses]
  );

  const earliestInFlight = useMemo(
    () =>
      syntheses.reduce<string | null>(
        (earliest, s) =>
          s.inFlightSince !== null && (earliest === null || s.inFlightSince < earliest)
            ? s.inFlightSince
            : earliest,
        null
      ),
    [syntheses]
  );

  useEffect(() => {
    if (earliestInFlight === null) return;
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["syntheses"] });
    }, 3000);
    return () => clearInterval(timer);
  }, [earliestInFlight]);

  useEffect(() => {
    if (earliestInFlight === null) {
      setIsStuck(false);
      return;
    }
    const elapsed = Date.now() - new Date(earliestInFlight).getTime();
    const remaining = IN_FLIGHT_STUCK_MS - elapsed;
    if (remaining <= 0) {
      setIsStuck(true);
      return;
    }
    const timer = setTimeout(() => setIsStuck(true), remaining);
    return () => clearTimeout(timer);
  }, [earliestInFlight]);

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

  const isStale = syntheses.some(isStaleSynthesis);

  return { syntheses, representative, isLoading, isStale, isStuck, error, run, reset };
}
