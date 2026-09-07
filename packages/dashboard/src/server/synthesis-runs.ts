import type { MemoryType, SynthesisRepository } from "@membank/core";
import { isReclaimableInFlight, MEMORY_TYPE_VALUES } from "@membank/core";

export interface SynthesisUnlockResult {
  unlocked: MemoryType[];
  live: MemoryType[];
}

export interface SynthesisRuns {
  /** Runs a synthesis, holding this process's claim on those types until it settles. */
  claim(scope: string, types: readonly MemoryType[], synthesize: () => Promise<unknown>): void;
  /** Releases every in-flight claim in the scope that no process stands behind, and reports the rest. */
  unlock(scope: string): SynthesisUnlockResult;
}

interface InFlightClaim {
  type: MemoryType;
  inFlightSince: string;
}

export function createSynthesisRuns(synthRepo: SynthesisRepository): SynthesisRuns {
  const running = new Map<string, Set<MemoryType>>();

  function release(scope: string, types: readonly MemoryType[]): void {
    const claimed = running.get(scope);
    if (claimed === undefined) return;
    for (const type of types) claimed.delete(type);
    if (claimed.size === 0) running.delete(scope);
  }

  function inFlightClaims(scope: string): InFlightClaim[] {
    return MEMORY_TYPE_VALUES.flatMap((type) => {
      const inFlightSince = synthRepo.getSynthesis(scope, type)?.inFlightSince;
      return inFlightSince == null ? [] : [{ type, inFlightSince }];
    });
  }

  function hasLiveProcess(scope: string, claim: InFlightClaim, now: number): boolean {
    const claimedHere = running.get(scope)?.has(claim.type) === true;
    return claimedHere || !isReclaimableInFlight(claim.inFlightSince, now);
  }

  return {
    claim(scope, types, synthesize) {
      const claimed = running.get(scope) ?? new Set<MemoryType>();
      for (const type of types) claimed.add(type);
      running.set(scope, claimed);

      void synthesize()
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`membank dashboard: synthesis failed for ${scope}: ${message}\n`);
        })
        .finally(() => release(scope, types));
    },

    unlock(scope) {
      const now = Date.now();
      const result: SynthesisUnlockResult = { unlocked: [], live: [] };

      for (const claim of inFlightClaims(scope)) {
        if (hasLiveProcess(scope, claim, now)) {
          result.live.push(claim.type);
          continue;
        }
        synthRepo.clearInFlight(scope, claim.type);
        result.unlocked.push(claim.type);
      }

      return result;
    },
  };
}
