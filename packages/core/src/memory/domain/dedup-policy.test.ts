import { describe, expect, it } from "vitest";
import { classifyDuplicate } from "./dedup-policy.js";
import { DEFAULT_THRESHOLDS } from "./thresholds.js";

const { autoOverwrite: AUTO_OVERWRITE_THRESHOLD, flag: FLAG_THRESHOLD } = DEFAULT_THRESHOLDS;

describe("classifyDuplicate", () => {
  it("returns 'overwrite' when similarity exceeds AUTO_OVERWRITE_THRESHOLD", () => {
    expect(classifyDuplicate(0.93, DEFAULT_THRESHOLDS)).toBe("overwrite");
    expect(classifyDuplicate(1.0, DEFAULT_THRESHOLDS)).toBe("overwrite");
    expect(classifyDuplicate(AUTO_OVERWRITE_THRESHOLD + 0.001, DEFAULT_THRESHOLDS)).toBe(
      "overwrite"
    );
  });

  it("returns 'flag' for similarity exactly at AUTO_OVERWRITE_THRESHOLD (not strictly greater)", () => {
    expect(classifyDuplicate(AUTO_OVERWRITE_THRESHOLD, DEFAULT_THRESHOLDS)).toBe("flag");
  });

  it("returns 'flag' when similarity is between FLAG_THRESHOLD and AUTO_OVERWRITE_THRESHOLD (inclusive)", () => {
    expect(classifyDuplicate(0.88, DEFAULT_THRESHOLDS)).toBe("flag");
    expect(classifyDuplicate(FLAG_THRESHOLD, DEFAULT_THRESHOLDS)).toBe("flag");
    expect(classifyDuplicate(AUTO_OVERWRITE_THRESHOLD, DEFAULT_THRESHOLDS)).toBe("flag");
  });

  it("returns null when similarity is below FLAG_THRESHOLD", () => {
    expect(classifyDuplicate(0.84, DEFAULT_THRESHOLDS)).toBe(null);
    expect(classifyDuplicate(0.0, DEFAULT_THRESHOLDS)).toBe(null);
    expect(classifyDuplicate(FLAG_THRESHOLD - 0.001, DEFAULT_THRESHOLDS)).toBe(null);
  });

  // The 0.75–0.85 band was the abandoned half of the review queue: topically
  // adjacent memories that were never duplicates.
  it("no longer flags the topically-adjacent band below 0.85", () => {
    expect(classifyDuplicate(0.75, DEFAULT_THRESHOLDS)).toBe(null);
    expect(classifyDuplicate(0.8, DEFAULT_THRESHOLDS)).toBe(null);
  });

  it("classifies against the caller's thresholds, not the defaults", () => {
    const loose = { autoOverwrite: 0.99, flag: 0.7, retentionFloor: 0.1 };

    expect(classifyDuplicate(0.75, loose)).toBe("flag");
    expect(classifyDuplicate(0.95, loose)).toBe("flag");
    expect(classifyDuplicate(0.995, loose)).toBe("overwrite");
  });
});
