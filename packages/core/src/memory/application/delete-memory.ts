import type { MemoryRepository } from "../ports.js";

export function deleteMemory(id: string, repo: MemoryRepository): Promise<void> {
  repo.delete(id);
  return Promise.resolve();
}
