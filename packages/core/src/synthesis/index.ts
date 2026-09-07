export { SynthesisEngine } from "./application/engine.js";
export { revertSynthesis } from "./application/revert-synthesis.js";
export { runSynthesis } from "./application/run-synthesis.js";
export {
  IN_FLIGHT_TIMEOUT_MS as SYNTHESIS_IN_FLIGHT_TIMEOUT_MS,
  isReclaimableInFlight,
} from "./domain/debounce-policy.js";
export { decideSynthesis } from "./domain/synthesis-threshold.js";
export type { SynthesisVersion } from "./domain/synthesis-version.js";
export { countWords, DEFAULT_SYNTHESIS_THRESHOLD_WORDS } from "./domain/word-count.js";
export { createSynthesisAgentRunner } from "./infrastructure/claude-agent-runner.js";
export { createSynthesisRepository } from "./infrastructure/sqlite-synthesis-repository.js";
export type { AgentRunner, SynthesisConfig, SynthesisRepository } from "./ports.js";
