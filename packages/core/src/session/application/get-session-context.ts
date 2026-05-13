import type { MemoryRepository } from "../../memory/ports.js";
import type { SessionContext } from "../../types.js";

export function getSessionContext(
  opts: { projectHash: string; synthesis?: string },
  deps: { repo: MemoryRepository }
): SessionContext {
  const s = deps.repo.stats();
  if (opts.synthesis !== undefined && opts.synthesis.length > 0) {
    return { stats: s.byType, pinnedGlobal: [], pinnedProject: [], synthesis: opts.synthesis };
  }
  return {
    stats: s.byType,
    pinnedGlobal: deps.repo.listPinnedGlobal(),
    pinnedProject: deps.repo.listPinnedForProject(opts.projectHash),
  };
}
