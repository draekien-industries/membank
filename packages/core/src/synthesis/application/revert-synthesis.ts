import type { Synthesis } from "../../schemas.js";
import type { SynthesisRepository } from "../ports.js";

export function revertSynthesis(
  scope: string,
  version: number,
  repo: SynthesisRepository
): Synthesis {
  const target = repo.getVersion(scope, version);
  if (target === undefined) {
    throw new Error(`Version ${version} not found for scope: ${scope}`);
  }
  return repo.saveSynthesis(scope, target.content, target.sourceMemoryHash);
}
