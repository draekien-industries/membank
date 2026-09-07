import type { PromotedMemoryWriter, RejectedCandidateRepository } from "../ports.js";

export type PromoteRejectedCandidateResult =
  | { status: "promoted"; memoryId: string; content: string }
  | { status: "not_found" };

/**
 * Promotes a rejected candidate into the memory corpus as an explicit human override of the
 * admission gate. The gate is deliberately not re-run: the classification that failed it is the
 * same one stored on the row, so re-adjudicating would reject every candidate a human wants to
 * keep and invite relabelling to get past it.
 */
export async function promoteRejectedCandidate(
  id: string,
  deps: { rejections: RejectedCandidateRepository; memories: PromotedMemoryWriter }
): Promise<PromoteRejectedCandidateResult> {
  const candidate = deps.rejections.get(id);
  if (candidate === undefined) return { status: "not_found" };

  // Dedup inside the writer may absorb this into an existing memory rather than create one, so
  // the returned id is not necessarily new — the row is spent either way.
  const saved = await deps.memories.save({
    content: candidate.content,
    type: candidate.type,
    durability: candidate.durability,
    projectHash: candidate.projectHash,
  });

  deps.rejections.remove(id);

  return { status: "promoted", memoryId: saved.id, content: candidate.content };
}
