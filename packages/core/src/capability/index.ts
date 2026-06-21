export { CapabilityKey } from "./domain/capability-key.js";
export type { Capability, CapabilityKind } from "./domain/capability-kind.js";
export {
  CAPABILITY_KIND_VALUES,
  CapabilityKindSchema,
  CapabilitySchema,
} from "./domain/capability-kind.js";
export type { MemoryQueryScope, MemoryTarget } from "./domain/memory-target.js";
export { createCapabilityRepository } from "./infrastructure/sqlite-capability-repository.js";
export type { CapabilityRepository } from "./ports.js";
