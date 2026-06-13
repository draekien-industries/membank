import type { MemoryType } from "../../schemas.js";
import { MEMORY_TYPE_VALUES } from "../../schemas.js";
import type { AgentRunner, SynthesisRepository } from "../ports.js";

async function synthesizeType(
  scope: string,
  type: MemoryType,
  memories: readonly string[],
  deps: { synthRepo: SynthesisRepository; agentRunner: AgentRunner }
): Promise<string> {
  deps.synthRepo.markInFlight(scope, type);
  try {
    const content = await deps.agentRunner.run(scope, type, memories);
    const sourceHash = deps.synthRepo.sourceMemoryHash(scope, type);
    deps.synthRepo.saveSynthesis(scope, type, content, sourceHash);
    return content;
  } catch (err) {
    deps.synthRepo.clearInFlight(scope, type);
    throw err;
  }
}

export async function runSynthesis(
  scope: string,
  deps: { synthRepo: SynthesisRepository; agentRunner: AgentRunner }
): Promise<string> {
  const sections: string[] = [];
  for (const type of MEMORY_TYPE_VALUES) {
    const memories = deps.synthRepo.nonPinnedMemoryContents(scope, type);
    if (memories.length === 0) continue;
    const content = await synthesizeType(scope, type, memories, deps);
    sections.push(`## ${type}\n${content}`);
  }
  return sections.join("\n\n");
}
