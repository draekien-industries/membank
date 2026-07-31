export interface Thresholds {
  readonly autoOverwrite: number;
  readonly flag: number;
  readonly retentionFloor: number;
  readonly retentionGraceDays: number;
}

// Calibrated against a real 705-memory corpus. A retention floor above a type weight
// condemns every memory of that type on the day it is written: an unretrieved learning
// caps at 0.16 and a decision at 0.24, so 0.3 flagged 88% of the corpus and 0.1 flags
// roughly the bottom quartile. A fact still scores 0.08 on arrival, below any useful
// floor, so the grace period — not the floor — is what protects a new memory.
export const DEFAULT_THRESHOLDS: Thresholds = {
  autoOverwrite: 0.92,
  flag: 0.85,
  retentionFloor: 0.1,
  retentionGraceDays: 30,
};

export type ThresholdKey = keyof Thresholds;

export class ThresholdConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThresholdConfigError";
  }
}

const SIMILARITY_KEYS: readonly ThresholdKey[] = ["autoOverwrite", "flag", "retentionFloor"];

function requireUnitInterval(key: ThresholdKey, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ThresholdConfigError(
      `thresholds.${key} must be a number between 0 and 1, got ${JSON.stringify(value)}`
    );
  }
  return value;
}

function requireDayCount(key: ThresholdKey, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ThresholdConfigError(
      `thresholds.${key} must be a number of days of 0 or more, got ${JSON.stringify(value)}`
    );
  }
  return value;
}

// Takes unknown values because the only caller is hand-edited JSON from ~/.membank/config.json.
export function resolveThresholds(overrides: Readonly<Record<string, unknown>> = {}): Thresholds {
  const resolved = { ...DEFAULT_THRESHOLDS };
  for (const key of SIMILARITY_KEYS) {
    const value = overrides[key];
    if (value !== undefined) resolved[key] = requireUnitInterval(key, value);
  }

  const graceDays = overrides.retentionGraceDays;
  if (graceDays !== undefined) {
    resolved.retentionGraceDays = requireDayCount("retentionGraceDays", graceDays);
  }

  // Above autoOverwrite everything is overwritten, so a higher flag threshold leaves an
  // empty band and dedup silently stops flagging anything for review.
  if (resolved.flag > resolved.autoOverwrite) {
    throw new ThresholdConfigError(
      `thresholds.flag (${resolved.flag}) must not exceed thresholds.autoOverwrite (${resolved.autoOverwrite}) — ` +
        "a higher flag threshold leaves no similarity band to flag for review"
    );
  }

  return resolved;
}
