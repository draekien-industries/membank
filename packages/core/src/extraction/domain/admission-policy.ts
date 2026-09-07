import type { DURABILITY_VALUES } from "../../schemas.js";

export type { Durability } from "../../schemas.js";
export { DURABILITY_VALUES } from "../../schemas.js";

export const DERIVABILITY_VALUES = ["hidden", "costly", "trivial"] as const;
export const ACTIONABILITY_VALUES = ["directive", "constraint", "context"] as const;

export type Derivability = (typeof DERIVABILITY_VALUES)[number];
export type Actionability = (typeof ACTIONABILITY_VALUES)[number];

// "inert" is no longer produced by decideAdmission; it remains a valid persisted value because
// rows rejected under the earlier gate survive until the retention horizon prunes them.
export const REJECTION_CLAUSE_VALUES = [
  "ungrounded",
  "volatile",
  "trivially-derivable",
  "inert",
] as const;

export type RejectionClause = (typeof REJECTION_CLAUSE_VALUES)[number];

export interface MemoryCandidate {
  content: string;
  type: string;
  durability: (typeof DURABILITY_VALUES)[number];
  derivability: Derivability;
  actionability: Actionability;
  evidence: string;
}

export type AdmissionDecision = { kind: "admit" } | { kind: "reject"; clause: RejectionClause };

const CLAUSE_EXPLANATIONS: Record<RejectionClause, string> = {
  ungrounded: "no verbatim evidence from the transcript — quote what the user actually said",
  volatile: "tied to the current task, PR, or branch; it will not be true in a different session",
  "trivially-derivable":
    "a future session learns this from one file read; the code is the source of truth",
  inert: "describes state without changing what a future session would do",
};

export function explainRejection(clause: RejectionClause): string {
  return CLAUSE_EXPLANATIONS[clause];
}

// Clause order is fixed so the reported reason is deterministic when a candidate
// fails more than one test.
//
// `actionability: context` is admitted on purpose. Synthesis injects stored memories into the
// session prompt without the session asking, so a memory that only describes state still changes
// what that session does — the premise the "inert" clause was built on does not hold here. The
// clause stays in RejectionClause because rows rejected under it persist until they are pruned.
export function decideAdmission(candidate: MemoryCandidate): AdmissionDecision {
  if (candidate.evidence.trim().length === 0) return { kind: "reject", clause: "ungrounded" };
  if (candidate.durability === "volatile") return { kind: "reject", clause: "volatile" };
  if (candidate.derivability === "trivial") {
    return { kind: "reject", clause: "trivially-derivable" };
  }
  return { kind: "admit" };
}
