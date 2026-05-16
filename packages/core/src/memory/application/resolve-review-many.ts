import type { BulkOpResult, MemoryRepository } from "../ports.js";

export function resolveReviewMany(ids: string[], repo: MemoryRepository): BulkOpResult[] {
  return ids.map((id) => {
    try {
      if (repo.findById(id) === undefined) {
        return { id, status: "error" as const, error: `Memory not found: ${id}` };
      }
      repo.resolveReviewEvents(id);
      return { id, status: "ok" as const };
    } catch (err) {
      return {
        id,
        status: "error" as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
