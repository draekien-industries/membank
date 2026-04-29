import { getScenario } from "../scenarios/index.js";
import type { MemoryType, RawRun } from "../types.js";

export interface RuleScores {
  called: 0 | 1;
  correctType: 0 | 1;
  noOverSave: number;
}

export function applyRules(run: RawRun): RuleScores {
  if (run.error) {
    return { called: 0, correctType: 0, noOverSave: 0 };
  }

  const scenario = getScenario(run.scenarioId);
  const calls = run.saveCalls;
  const called: 0 | 1 = calls.length > 0 ? 1 : 0;

  let correctType: 0 | 1 = 0;
  if (called) {
    const firstType = calls[0]?.type as MemoryType | "";
    correctType = firstType === scenario.expectedType ? 1 : 0;
  }

  let noOverSave = 1;
  if (calls.length === 2) noOverSave = 0.5;
  else if (calls.length >= 3) noOverSave = 0;

  return { called, correctType, noOverSave };
}

export interface FullScores extends RuleScores {
  intentNotVerbatim: 0 | 0.5 | 1;
  noFalsePositive: 0 | 1;
  total: number;
}

export const WEIGHTS = {
  called: 0.3,
  correctType: 0.25,
  intentNotVerbatim: 0.25,
  noFalsePositive: 0.1,
  noOverSave: 0.1,
} as const;

export function computeTotal(s: Omit<FullScores, "total">): number {
  if (s.called === 0) return 0;
  return (
    WEIGHTS.called * s.called +
    WEIGHTS.correctType * s.correctType +
    WEIGHTS.intentNotVerbatim * s.intentNotVerbatim +
    WEIGHTS.noFalsePositive * s.noFalsePositive +
    WEIGHTS.noOverSave * s.noOverSave
  );
}
