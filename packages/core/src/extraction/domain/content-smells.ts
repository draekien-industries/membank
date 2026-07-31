export const CONTENT_SMELL_VALUES = [
  "code-reference",
  "completed-action",
  "session-deixis",
] as const;

export type ContentSmell = (typeof CONTENT_SMELL_VALUES)[number];

const PATTERNS: Record<ContentSmell, RegExp> = {
  "code-reference": /(?:[\w.@/-]+\.(?:ts|tsx|js|jsx|json|md|sql|yml|yaml|toml)\b|\bsrc\/[\w./-]+)/i,
  "completed-action":
    /\b(?:fixed|added|removed|renamed|migrated|refactored|implemented|replaced|deleted|updated)\b/i,
  "session-deixis": /\b(?:for now|this session|just this once|currently|at the moment|we just)\b/i,
};

// Advisory only. These never reject: a real gotcha can legitimately name a symbol,
// and a regex cannot tell the two apart. They exist to make a divergence between
// the agent's self-reported rubric and the visible shape of the content observable.
export function detectContentSmells(content: string): ContentSmell[] {
  return CONTENT_SMELL_VALUES.filter((smell) => PATTERNS[smell].test(content));
}
