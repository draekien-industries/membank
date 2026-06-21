import type { Capability, CapabilityKind, Memory } from "../schemas.js";
import type { CapabilityKey } from "./domain/capability-key.js";

export interface CapabilityRepository {
  upsertByKey(key: CapabilityKey): Capability;
  findByKey(key: CapabilityKey): Capability | null;
  listByKind(kind: CapabilityKind): Array<Capability & { memoryCount: number }>;
  associate(memoryId: string, capabilityId: string): void;
  allMemoriesForCapability(key: CapabilityKey): Memory[];
}
