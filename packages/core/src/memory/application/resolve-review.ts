import type { MemoryRepository } from "../ports.js";

export function resolveReview(memoryId: string, repo: MemoryRepository): void {
  repo.resolveReviewEvents(memoryId);
}
