import type { MemoryType, Synthesis } from "../../schemas.js";
import type { SynthesisRepository } from "../ports.js";

export function revertSynthesis(
  scope: string,
  memoryType: MemoryType,
  version: number,
  repo: SynthesisRepository
): Synthesis {
  const target = repo.getVersion(scope, memoryType, version);
  if (target === undefined) {
    throw new Error(`Version ${version} not found for scope: ${scope} type: ${memoryType}`);
  }
  return repo.saveSynthesis(scope, memoryType, target.content, target.sourceMemoryHash);
}
