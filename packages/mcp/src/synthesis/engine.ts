import type { DatabaseManager, SynthesisRepository } from "@membank/core";
import type { SynthesisAgentLoop, SynthesisConfig } from "./agent-loop.js";

const DEFAULT_DEBOUNCE_MS = 45_000;
const DEFAULT_IN_FLIGHT_TIMEOUT_MS = 120_000;
const MAX_BACKOFF_MULTIPLIER = 5;

export class SynthesisEngine {
  readonly #synthRepo: SynthesisRepository;
  readonly #config: SynthesisConfig;
  readonly #agentLoop: SynthesisAgentLoop;
  readonly #dirtyScopes = new Set<string>();
  readonly #failureCounts = new Map<string, number>();
  #running = false;
  #loopTimer: ReturnType<typeof setTimeout> | undefined;
  #inFlightPromises = new Map<string, Promise<void>>();

  constructor(
    _db: DatabaseManager,
    synthRepo: SynthesisRepository,
    config: SynthesisConfig,
    agentLoop: SynthesisAgentLoop
  ) {
    this.#synthRepo = synthRepo;
    this.#config = config;
    this.#agentLoop = agentLoop;
  }

  async init(): Promise<void> {
    this.#synthRepo.expireStale();

    const stale = this.#synthRepo.getExpiredOrDirtyScopes();
    for (const { scope } of stale) {
      this.#dirtyScopes.add(scope);
    }

    this.#running = true;
    // Process any scopes discovered at startup immediately, then begin the periodic cycle
    await this.#debounceLoop();
  }

  shutdown(): Promise<void> {
    this.#running = false;

    if (this.#loopTimer !== undefined) {
      clearTimeout(this.#loopTimer);
      this.#loopTimer = undefined;
    }

    const inFlight = [...this.#inFlightPromises.values()];
    if (inFlight.length === 0) return Promise.resolve();

    const graceMs = 5_000;
    return Promise.race([
      Promise.allSettled(inFlight).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, graceMs)),
    ]);
  }

  markDirty(scope: string): void {
    this.#dirtyScopes.add(scope);
  }

  #scheduleNextCycle(): void {
    if (!this.#running) return;
    const debounceMs = this.#config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.#loopTimer = setTimeout(() => {
      void this.#debounceLoop();
    }, debounceMs);
  }

  async #debounceLoop(): Promise<void> {
    const scopesToProcess = [...this.#dirtyScopes];

    for (const scope of scopesToProcess) {
      const inFlightTimeoutMs = this.#config.inFlightTimeoutMs ?? DEFAULT_IN_FLIGHT_TIMEOUT_MS;
      const synthesis = this.#synthRepo.getSynthesis(scope);

      if (synthesis?.inFlightSince !== null && synthesis?.inFlightSince !== undefined) {
        const inFlightMs = Date.now() - new Date(synthesis.inFlightSince).getTime();
        if (inFlightMs < inFlightTimeoutMs) {
          continue;
        }
        // Stale in-flight — clear it and allow resynthesis
        this.#synthRepo.clearInFlight(scope);
      }

      this.#dirtyScopes.delete(scope);
      const promise = this.#synthesizeScope(scope).finally(() => {
        this.#inFlightPromises.delete(scope);
      });
      this.#inFlightPromises.set(scope, promise);
    }

    this.#scheduleNextCycle();
  }

  async #synthesizeScope(scope: string): Promise<void> {
    this.#synthRepo.markInFlight(scope);

    try {
      const content = await this.#agentLoop.run(scope);
      const sourceHash = this.#synthRepo.computeSourceMemoryHash(scope);
      this.#synthRepo.saveSynthesis(scope, content, sourceHash);
      this.#failureCounts.delete(scope);
    } catch (err) {
      const failures = (this.#failureCounts.get(scope) ?? 0) + 1;
      this.#failureCounts.set(scope, failures);

      // Exponential backoff: re-queue with multiplied debounce up to MAX_BACKOFF_MULTIPLIER
      const backoffMultiplier = Math.min(failures, MAX_BACKOFF_MULTIPLIER);
      const backoffMs = (this.#config.debounceMs ?? DEFAULT_DEBOUNCE_MS) * backoffMultiplier;

      process.stderr.write(
        `membank synthesis: error for scope=${scope} failures=${failures} backoff=${backoffMs}ms: ${err instanceof Error ? err.message : String(err)}\n`
      );

      setTimeout(() => {
        this.#dirtyScopes.add(scope);
      }, backoffMs);

      this.#synthRepo.clearInFlight(scope);
    }
  }
}
