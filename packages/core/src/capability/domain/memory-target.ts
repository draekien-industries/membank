import type { CapabilityKey } from "./capability-key.js";

export type MemoryTarget =
  | { tag: "project"; scope: { hash: string; name: string; origin?: string } }
  | { tag: "global" }
  | { tag: "capability"; key: CapabilityKey };

export type MemoryQueryScope =
  | { tag: "current"; projectHash: string }
  | { tag: "global" }
  | { tag: "all" }
  | { tag: "capability"; key: CapabilityKey };
