import type { MemoryRepository } from "../../memory/ports.js";
import type { SessionContext } from "../../schemas.js";

export function getSessionContext(
  opts: { projectHash: string; synthesis?: string },
  deps: { repo: MemoryRepository }
): SessionContext {
  const s = deps.repo.stats(opts.projectHash);
  if (opts.synthesis !== undefined && opts.synthesis.length > 0) {
    return { mode: "synthesis", stats: s.byType, synthesis: opts.synthesis };
  }
  return {
    mode: "pinned",
    stats: s.byType,
    pinnedGlobal: deps.repo.listPinnedGlobal(),
    pinnedProject: deps.repo.listPinnedForProject(opts.projectHash),
  };
}
