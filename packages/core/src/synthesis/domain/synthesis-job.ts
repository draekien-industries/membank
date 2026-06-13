import type { MemoryType } from "../../schemas.js";

export type ScopeStatus = "expired" | "dirty" | "missing";

export interface DirtyScope {
  scope: string;
  memoryType: MemoryType;
  reason: ScopeStatus;
}
