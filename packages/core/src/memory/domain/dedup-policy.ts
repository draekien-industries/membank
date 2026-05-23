export const AUTO_OVERWRITE_THRESHOLD = 0.92;
export const FLAG_THRESHOLD = 0.75;

export type DedupDecision = "overwrite" | "flag" | null;

export function classifyDuplicate(similarity: number): DedupDecision {
  if (similarity > AUTO_OVERWRITE_THRESHOLD) return "overwrite";
  if (similarity >= FLAG_THRESHOLD) return "flag";
  return null;
}
