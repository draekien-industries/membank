import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, resolveThresholds, ThresholdConfigError } from "./thresholds.js";

describe("resolveThresholds", () => {
  it("returns the defaults when nothing is overridden", () => {
    expect(resolveThresholds()).toEqual(DEFAULT_THRESHOLDS);
    expect(resolveThresholds({})).toEqual(DEFAULT_THRESHOLDS);
  });

  it("overrides only the keys that are present", () => {
    const resolved = resolveThresholds({ retentionFloor: 0.25 });

    expect(resolved.retentionFloor).toBe(0.25);
    expect(resolved.flag).toBe(DEFAULT_THRESHOLDS.flag);
    expect(resolved.autoOverwrite).toBe(DEFAULT_THRESHOLDS.autoOverwrite);
  });

  it("accepts the boundaries of the unit interval", () => {
    expect(resolveThresholds({ flag: 0, retentionFloor: 0 }).flag).toBe(0);
    expect(resolveThresholds({ autoOverwrite: 1, flag: 1 }).autoOverwrite).toBe(1);
  });

  it("names the offending key when a value is out of range", () => {
    expect(() => resolveThresholds({ flag: 1.5 })).toThrow(ThresholdConfigError);
    expect(() => resolveThresholds({ flag: 1.5 })).toThrow(/thresholds\.flag/);
    expect(() => resolveThresholds({ retentionFloor: -0.1 })).toThrow(/thresholds\.retentionFloor/);
  });

  it("rejects a non-numeric value rather than coercing it", () => {
    // Config is user-edited JSON, so a quoted number is the likeliest typo.
    expect(() => resolveThresholds({ flag: "0.9" })).toThrow(ThresholdConfigError);
    expect(() => resolveThresholds({ autoOverwrite: null })).toThrow(ThresholdConfigError);
  });

  it("rejects a flag threshold above the auto-overwrite threshold", () => {
    // Otherwise the flag band is empty and dedup silently stops queuing anything for review.
    expect(() => resolveThresholds({ flag: 0.95, autoOverwrite: 0.9 })).toThrow(/must not exceed/);
  });

  it("allows the two dedup thresholds to be equal", () => {
    expect(resolveThresholds({ flag: 0.9, autoOverwrite: 0.9 }).flag).toBe(0.9);
  });

  // A day count is not a similarity, so it must not be held to the 0..1 range.
  it("accepts a grace period beyond the unit interval", () => {
    expect(resolveThresholds({ retentionGraceDays: 90 }).retentionGraceDays).toBe(90);
    expect(resolveThresholds({ retentionGraceDays: 0 }).retentionGraceDays).toBe(0);
  });

  it("rejects a negative or non-numeric grace period", () => {
    expect(() => resolveThresholds({ retentionGraceDays: -1 })).toThrow(
      /thresholds\.retentionGraceDays/
    );
    expect(() => resolveThresholds({ retentionGraceDays: "30" })).toThrow(ThresholdConfigError);
  });
});
