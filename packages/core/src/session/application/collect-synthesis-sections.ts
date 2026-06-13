import { MEMORY_TYPE_VALUES } from "../../schemas.js";
import { countWords, decideSynthesis, type SynthesisRepository } from "../../synthesis/index.js";
import type { SessionSectionInput } from "./get-session-context.js";

export type SynthesisScope = { scope: string; synthesizable: boolean };

export function collectSynthesisSections(
  synthRepo: SynthesisRepository,
  scopes: readonly SynthesisScope[],
  thresholdWords: number
): SessionSectionInput[] {
  const sections: SessionSectionInput[] = [];
  for (const memoryType of MEMORY_TYPE_VALUES) {
    for (const { scope, synthesizable } of scopes) {
      const memories = synthRepo.nonPinnedMemoryContents(scope, memoryType);
      if (memories.length === 0) continue;

      if (decideSynthesis(countWords(memories), thresholdWords).kind === "verbatim") {
        sections.push({ kind: "verbatim", memoryType, memories, synthesizable: false });
        continue;
      }

      const synthesis = synthRepo.getSynthesis(scope, memoryType);
      const content =
        synthesis !== undefined && synthesis.inFlightSince === null ? synthesis.content : undefined;
      sections.push(
        content !== undefined
          ? { kind: "synthesis", memoryType, content }
          : { kind: "verbatim", memoryType, memories, synthesizable }
      );
    }
  }
  return sections;
}
