import type { MemoryType } from "../../schemas.js";
import { MEMORY_TYPE_VALUES } from "../../schemas.js";
import {
  DEFAULT_DEBOUNCE_MS,
  IN_FLIGHT_TIMEOUT_MS,
  isReclaimableInFlight,
  MAX_BACKOFF_MULTIPLIER,
} from "../domain/debounce-policy.js";
import { decideSynthesis } from "../domain/synthesis-threshold.js";
import { countWords, DEFAULT_SYNTHESIS_THRESHOLD_WORDS } from "../domain/word-count.js";
import type { AgentRunner, SynthesisConfig, SynthesisRepository } from "../ports.js";

function jobKey(scope: string, type: MemoryType): string {
  return `${scope} ${type}`;
}

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
      this.#dirtyScopes.delete(scope);
      for (const type of MEMORY_TYPE_VALUES) {
        this.#processType(scope, type);
      }
    }

    this.#scheduleNextCycle();
  }

  #processType(scope: string, type: MemoryType): void {
    const memories = this.#synthRepo.nonPinnedMemoryContents(scope, type);
    if (memories.length === 0) return;

    const thresholdWords =
      this.#config.synthesisThresholdWords ?? DEFAULT_SYNTHESIS_THRESHOLD_WORDS;
    if (decideSynthesis(countWords(memories), thresholdWords).kind === "verbatim") return;

    const inFlightTimeoutMs = this.#config.inFlightTimeoutMs ?? IN_FLIGHT_TIMEOUT_MS;
    const synthesis = this.#synthRepo.getSynthesis(scope, type);

    const inFlightSince = synthesis?.inFlightSince;
    if (inFlightSince != null) {
      if (!isReclaimableInFlight(inFlightSince, Date.now(), inFlightTimeoutMs)) return;
      this.#synthRepo.clearInFlight(scope, type);
    }

    const key = jobKey(scope, type);
    const promise = this.#synthesizeType(scope, type, memories).finally(() => {
      this.#inFlightPromises.delete(key);
    });
    this.#inFlightPromises.set(key, promise);
  }

  async #synthesizeType(scope: string, type: MemoryType, memories: string[]): Promise<void> {
    const key = jobKey(scope, type);
    this.#synthRepo.markInFlight(scope, type);

    try {
      const content = await this.#agentRunner.run(scope, type, memories);
      const sourceHash = this.#synthRepo.sourceMemoryHash(scope, type);
      this.#synthRepo.saveSynthesis(scope, type, content, sourceHash);
      this.#failureCounts.delete(key);
    } catch (err) {
      const failures = (this.#failureCounts.get(key) ?? 0) + 1;
      this.#failureCounts.set(key, failures);

      const backoffMultiplier = Math.min(failures, MAX_BACKOFF_MULTIPLIER);
      const backoffMs = (this.#config.debounceMs ?? DEFAULT_DEBOUNCE_MS) * backoffMultiplier;

      process.stderr.write(
        `membank synthesis: error for scope=${scope} type=${type} failures=${failures} backoff=${backoffMs}ms: ${err instanceof Error ? err.message : String(err)}\n`
      );

      setTimeout(() => {
        this.#dirtyScopes.add(scope);
      }, backoffMs);

      this.#synthRepo.clearInFlight(scope, type);
    }
  }
}
