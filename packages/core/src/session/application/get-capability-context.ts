import type { CapabilityKey } from "../../capability/domain/capability-key.js";
import type { CapabilityRepository } from "../../capability/ports.js";
import type { Memory } from "../../schemas.js";
import { renderCapabilityContext } from "../domain/render-capability-context.js";

export type CapabilityContext = {
  key: string;
  memories: Memory[];
  rendered: string;
};

export function getCapabilityContext(
  opts: { key: CapabilityKey },
  deps: { capabilities: CapabilityRepository }
): CapabilityContext | null {
  const memories = deps.capabilities.allMemoriesForCapability(opts.key);
  if (memories.length === 0) return null;

  const key = opts.key.toString();
  return {
    key,
    memories,
    rendered: renderCapabilityContext(key, memories),
  };
}
