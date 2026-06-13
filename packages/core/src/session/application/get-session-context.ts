import type { MemoryRepository } from "../../memory/ports.js";
import type { MemoryType, SessionContext, SessionContextSection } from "../../schemas.js";
import { MEMORY_TYPE_VALUES } from "../../schemas.js";

export type SessionSectionPayload =
  | { kind: "synthesis"; content: string }
  | { kind: "verbatim"; memories: readonly string[] };

export function getSessionContext(
  opts: { projectHash: string; sections?: Partial<Record<MemoryType, SessionSectionPayload>> },
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

function orderSections(
  byType: Partial<Record<MemoryType, SessionSectionPayload>> | undefined
): SessionContextSection[] {
  if (byType === undefined) return [];
  const sections: SessionContextSection[] = [];
  for (const memoryType of MEMORY_TYPE_VALUES) {
    const payload = byType[memoryType];
    if (payload === undefined) continue;
    if (payload.kind === "synthesis") {
      if (payload.content.length > 0) {
        sections.push({ kind: "synthesis", memoryType, content: payload.content });
      }
    } else if (payload.memories.length > 0) {
      sections.push({ kind: "verbatim", memoryType, memories: [...payload.memories] });
    }
  }
  return sections;
}
