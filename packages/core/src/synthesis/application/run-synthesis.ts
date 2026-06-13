import type { MemoryType } from "../../schemas.js";
import { MEMORY_TYPE_VALUES } from "../../schemas.js";
import { decideSynthesis } from "../domain/synthesis-threshold.js";
import { countWords } from "../domain/word-count.js";
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
  deps: { synthRepo: SynthesisRepository; agentRunner: AgentRunner },
  opts?: { type?: MemoryType; thresholdWords?: number }
): Promise<string> {
  const types = opts?.type === undefined ? MEMORY_TYPE_VALUES : [opts.type];
  const thresholdWords = opts?.thresholdWords;
  const sections: string[] = [];
  for (const t of types) {
    const memories = deps.synthRepo.nonPinnedMemoryContents(scope, t);
    if (memories.length === 0) continue;
    if (
      thresholdWords !== undefined &&
      decideSynthesis(countWords(memories), thresholdWords).kind === "verbatim"
    ) {
      continue;
    }
    const content = await synthesizeType(scope, t, memories, deps);
    sections.push(`## ${t}\n${content}`);
  }
  return sections.join("\n\n");
}
