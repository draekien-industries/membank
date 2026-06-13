export type SynthesisDecision = { kind: "synthesize" } | { kind: "verbatim" };

export function decideSynthesis(wordCount: number, thresholdWords: number): SynthesisDecision {
  return wordCount >= thresholdWords ? { kind: "synthesize" } : { kind: "verbatim" };
}
