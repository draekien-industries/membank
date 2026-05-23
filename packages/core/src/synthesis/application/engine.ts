import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import {
  DEFAULT_DEBOUNCE_MS,
  IN_FLIGHT_TIMEOUT_MS,
  MAX_BACKOFF_MULTIPLIER,
} from "../domain/debounce-policy.js";
import type { AgentRunner, SynthesisConfig, SynthesisRepository } from "../ports.js";

export class SynthesisEngine {
  readonly #synthRepo: SynthesisRepository;
  readonly #config: SynthesisConfig;
  readonly #agentRunner: AgentRunner;
  readonly #dirtyScopes = new Set<string>();
  readonly #failureCounts = new Map<string, number>();
  #running = false;
  #loopTimer: ReturnType<typeof setTimeout> | undefined;
  #inFlightPromises = new Map<string, Promise<void>>();

  constructor(synthRepo: SynthesisRepository, config: SynthesisConfig, agentRunner: AgentRunner) {
    this.#synthRepo = synthRepo;
    this.#config = config;
    this.#agentRunner = agentRunner;
  }

  async init(): Promise<void> {
    const stale = this.#synthRepo.initializeAndGetDirtyScopes(
      this.#config.inFlightTimeoutMs ?? IN_FLIGHT_TIMEOUT_MS
    );
    for (const { scope } of stale) {
      this.#dirtyScopes.add(scope);
    }

    this.#running = true;
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
      const inFlightTimeoutMs = this.#config.inFlightTimeoutMs ?? IN_FLIGHT_TIMEOUT_MS;
      const synthesis = this.#synthRepo.getSynthesis(scope);

      if (synthesis?.inFlightSince !== null && synthesis?.inFlightSince !== undefined) {
        const inFlightMs = Date.now() - new Date(synthesis.inFlightSince).getTime();
        if (inFlightMs < inFlightTimeoutMs) {
          continue;
        }
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
      const projectHash = scope === GLOBAL_SCOPE_HASH ? undefined : scope;
      const content = await this.#agentRunner.run(scope, projectHash);
      const sourceHash = this.#synthRepo.sourceMemoryHash(scope);
      this.#synthRepo.saveSynthesis(scope, content, sourceHash);
      this.#failureCounts.delete(scope);
    } catch (err) {
      const failures = (this.#failureCounts.get(scope) ?? 0) + 1;
      this.#failureCounts.set(scope, failures);

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
