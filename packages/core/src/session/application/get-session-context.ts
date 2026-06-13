import type { MemoryRepository } from "../../memory/ports.js";
import type { MemoryType, SessionContext, SessionContextSection } from "../../schemas.js";
import { MEMORY_TYPE_VALUES } from "../../schemas.js";

export type SessionSectionInput =
  | { kind: "synthesis"; memoryType: MemoryType; content: string }
  | { kind: "verbatim"; memoryType: MemoryType; memories: readonly string[] };

export function getSessionContext(
  opts: { projectHash: string; sections?: readonly SessionSectionInput[] },
  deps: { repo: MemoryRepository }
): SessionContext {
  const s = deps.repo.stats(opts.projectHash);
  return {
    stats: s.byType,
    pinnedGlobal: deps.repo.listPinnedGlobal(),
    pinnedProject: deps.repo.listPinnedForProject(opts.projectHash),
    sections: orderSections(opts.sections),
  };
}

const PRECEDENCE_RANK = new Map<MemoryType, number>(
  MEMORY_TYPE_VALUES.map((type, index) => [type, index])
);

function orderSections(
  inputs: readonly SessionSectionInput[] | undefined
): SessionContextSection[] {
  if (inputs === undefined) return [];

  const sections: SessionContextSection[] = [];
  for (const input of inputs) {
    if (input.kind === "synthesis") {
      if (input.content.length > 0) {
        sections.push({ kind: "synthesis", memoryType: input.memoryType, content: input.content });
      }
    } else if (input.memories.length > 0) {
      sections.push({
        kind: "verbatim",
        memoryType: input.memoryType,
        memories: [...input.memories],
      });
    }
  }

  return sections.sort(
    (a, b) =>
      (PRECEDENCE_RANK.get(a.memoryType) ?? MEMORY_TYPE_VALUES.length) -
      (PRECEDENCE_RANK.get(b.memoryType) ?? MEMORY_TYPE_VALUES.length)
  );
}
