import { isReclaimableInFlight, SYNTHESIS_IN_FLIGHT_TIMEOUT_MS } from "@membank/core/client";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useState } from "react";
import { runProjectSynthesis, unlockProjectSynthesis } from "@/lib/api";
import { queryClient, synthesisCollection } from "@/lib/collections";
import type { MemoryType, Project, Synthesis, SynthesisUnlockResult } from "@/lib/types";

const SLOW_AFTER_MS = 60_000;
const POLL_MS = 3000;

export type SynthesisPhase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "slow"; since: string }
  | { kind: "stuck"; since: string };

function isStaleSynthesis(synthesis: Synthesis): boolean {
  return synthesis.inFlightSince === null && new Date(synthesis.expiresAt) < new Date();
}

function phaseOf(inFlightSince: string | null, now: number): SynthesisPhase {
  if (inFlightSince === null) return { kind: "idle" };
  if (isReclaimableInFlight(inFlightSince, now)) return { kind: "stuck", since: inFlightSince };
  if (now - Date.parse(inFlightSince) >= SLOW_AFTER_MS) {
    return { kind: "slow", since: inFlightSince };
  }
  return { kind: "running" };
}

export interface ProjectSynthesisState {
  syntheses: Synthesis[];
  representative: Synthesis | null;
  isLoading: boolean;
  isStale: boolean;
  phase: SynthesisPhase;
  error: string | null;
  run: (memoryType?: MemoryType) => Promise<void>;
  unlock: () => Promise<SynthesisUnlockResult | null>;
}

export function useProjectSynthesis(project: Project): ProjectSynthesisState {
  const [error, setError] = useState<string | null>(null);

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

  const [phase, setPhase] = useState<SynthesisPhase>(() => phaseOf(earliestInFlight, Date.now()));

  useEffect(() => {
    if (earliestInFlight === null) return;
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["syntheses"] });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [earliestInFlight]);

  // Waking only at the two thresholds keeps a long synthesis from re-rendering the overview
  // every poll, since nothing else in the phase changes between them.
  useEffect(() => {
    const update = (): void => setPhase(phaseOf(earliestInFlight, Date.now()));
    update();
    if (earliestInFlight === null) return;

    const elapsedMs = Date.now() - Date.parse(earliestInFlight);
    const timers = [SLOW_AFTER_MS, SYNTHESIS_IN_FLIGHT_TIMEOUT_MS]
      .filter((threshold) => elapsedMs < threshold)
      .map((threshold) => setTimeout(update, threshold - elapsedMs));

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [earliestInFlight]);

  const run = useCallback(
    async (memoryType?: MemoryType) => {
      setError(null);
      try {
        await runProjectSynthesis(project.id, memoryType);
        await queryClient.invalidateQueries({ queryKey: ["syntheses"] });
      } catch {
        setError("Failed to start synthesis");
      }
    },
    [project.id]
  );

  const unlock = useCallback(async (): Promise<SynthesisUnlockResult | null> => {
    setError(null);
    try {
      const result = await unlockProjectSynthesis(project.id);
      await queryClient.invalidateQueries({ queryKey: ["syntheses"] });
      return result;
    } catch {
      setError("Failed to unlock synthesis");
      return null;
    }
  }, [project.id]);

  const isStale = syntheses.some(isStaleSynthesis);

  return { syntheses, representative, isLoading, isStale, phase, error, run, unlock };
}
