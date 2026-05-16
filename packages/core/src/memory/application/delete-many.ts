import type { ActivityLogger } from "../../activity/ports.js";
import { noopActivityLogger } from "../../activity/ports.js";
import type { BulkOpResult, MemoryRepository } from "../ports.js";
import { deleteMemory } from "./delete-memory.js";

export async function deleteManyMemories(
  ids: string[],
  repo: MemoryRepository,
  activityLogger: ActivityLogger = noopActivityLogger
): Promise<BulkOpResult[]> {
  const results: BulkOpResult[] = [];
  for (const id of ids) {
    try {
      await deleteMemory(id, repo, activityLogger);
      results.push({ id, status: "ok" });
    } catch (err) {
      results.push({
        id,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
