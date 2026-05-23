import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { AgentRunner, SynthesisRepository } from "../ports.js";

export async function runSynthesis(
  scope: string,
  deps: { synthRepo: SynthesisRepository; agentRunner: AgentRunner }
): Promise<string> {
  const projectHash = scope === GLOBAL_SCOPE_HASH ? undefined : scope;
  deps.synthRepo.markInFlight(scope);
  try {
    const [content, sourceHash] = await Promise.all([
      deps.agentRunner.run(scope, projectHash),
      Promise.resolve(deps.synthRepo.sourceMemoryHash(scope)),
    ]);
    deps.synthRepo.saveSynthesis(scope, content, sourceHash);
    return content;
  } catch (err) {
    deps.synthRepo.clearInFlight(scope);
    throw err;
  }
}
