import type { HarnessId, PinState, PromptId, RawRun } from "../types.js";

export interface CellStats {
  promptId: PromptId;
  harness: HarnessId;
  pinState: PinState;
  n: number;
  mean: number;
  ciLow: number;
  ciHigh: number;
}

export interface RollupStats {
  promptId: PromptId;
  harness: HarnessId;
  n: number;
  mean: number;
  ciLow: number;
  ciHigh: number;
}

export interface HarnessWinner {
  harness: HarnessId;
  winner: PromptId;
  winnerStats: RollupStats;
  runnerUp?: { promptId: PromptId; mean: number };
  delta?: number;
  ciOverlapsRunnerUp: boolean;
}

const Z = 1.96;

function meanAndCi(scores: number[]): { mean: number; ciLow: number; ciHigh: number; n: number } {
  const n = scores.length;
  if (n === 0) return { mean: 0, ciLow: 0, ciHigh: 0, n: 0 };
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, ciLow: mean, ciHigh: mean, n };
  const variance = scores.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  const margin = Z * se;
  return {
    mean,
    ciLow: Math.max(0, mean - margin),
    ciHigh: Math.min(1, mean + margin),
    n,
  };
}

export function buildCellStats(runs: RawRun[]): CellStats[] {
  const groups = new Map<string, RawRun[]>();
  for (const r of runs) {
    if (r.score === undefined) continue;
    const key = `${r.promptId}|${r.harness}|${r.pinState}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(r);
  }
  const cells: CellStats[] = [];
  for (const [key, arr] of groups) {
    const [promptId, harness, pinState] = key.split("|") as [PromptId, HarnessId, PinState];
    const scores = arr.map((r) => r.score ?? 0);
    const stats = meanAndCi(scores);
    cells.push({ promptId, harness, pinState, ...stats });
  }
  return cells;
}

export function buildRollups(runs: RawRun[]): RollupStats[] {
  const groups = new Map<string, RawRun[]>();
  for (const r of runs) {
    if (r.score === undefined) continue;
    const key = `${r.promptId}|${r.harness}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(r);
  }
  const rollups: RollupStats[] = [];
  for (const [key, arr] of groups) {
    const [promptId, harness] = key.split("|") as [PromptId, HarnessId];
    const scores = arr.map((r) => r.score ?? 0);
    const stats = meanAndCi(scores);
    rollups.push({ promptId, harness, ...stats });
  }
  return rollups;
}

export function pickWinners(rollups: RollupStats[]): HarnessWinner[] {
  const byHarness = new Map<HarnessId, RollupStats[]>();
  for (const r of rollups) {
    let arr = byHarness.get(r.harness);
    if (!arr) {
      arr = [];
      byHarness.set(r.harness, arr);
    }
    arr.push(r);
  }
  const winners: HarnessWinner[] = [];
  for (const [harness, arr] of byHarness) {
    const sorted = [...arr].sort((a, b) => b.mean - a.mean);
    const top = sorted[0];
    const second = sorted[1];
    if (!top) continue;
    const overlap = second ? top.ciLow <= second.ciHigh : false;
    winners.push({
      harness,
      winner: top.promptId,
      winnerStats: top,
      runnerUp: second ? { promptId: second.promptId, mean: second.mean } : undefined,
      delta: second ? top.mean - second.mean : undefined,
      ciOverlapsRunnerUp: overlap,
    });
  }
  return winners;
}
