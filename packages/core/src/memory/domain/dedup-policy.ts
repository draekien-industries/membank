import type { Thresholds } from "./thresholds.js";

export type DedupDecision = "overwrite" | "flag" | null;

export function classifyDuplicate(similarity: number, thresholds: Thresholds): DedupDecision {
  if (similarity > thresholds.autoOverwrite) return "overwrite";
  if (similarity >= thresholds.flag) return "flag";
  return null;
}
