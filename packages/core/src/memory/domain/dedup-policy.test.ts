import { describe, expect, it } from "vitest";
import { AUTO_OVERWRITE_THRESHOLD, classifyDuplicate, FLAG_THRESHOLD } from "./dedup-policy.js";

describe("classifyDuplicate", () => {
  it("returns 'overwrite' when similarity exceeds AUTO_OVERWRITE_THRESHOLD", () => {
    expect(classifyDuplicate(0.93)).toBe("overwrite");
    expect(classifyDuplicate(1.0)).toBe("overwrite");
    expect(classifyDuplicate(AUTO_OVERWRITE_THRESHOLD + 0.001)).toBe("overwrite");
  });

  it("returns 'flag' for similarity exactly at AUTO_OVERWRITE_THRESHOLD (not strictly greater)", () => {
    expect(classifyDuplicate(AUTO_OVERWRITE_THRESHOLD)).toBe("flag");
  });

  it("returns 'flag' when similarity is between FLAG_THRESHOLD and AUTO_OVERWRITE_THRESHOLD (inclusive)", () => {
    expect(classifyDuplicate(0.88)).toBe("flag");
    expect(classifyDuplicate(FLAG_THRESHOLD)).toBe("flag");
    expect(classifyDuplicate(AUTO_OVERWRITE_THRESHOLD)).toBe("flag");
  });

  it("returns null when similarity is below FLAG_THRESHOLD", () => {
    expect(classifyDuplicate(0.84)).toBe(null);
    expect(classifyDuplicate(0.0)).toBe(null);
    expect(classifyDuplicate(FLAG_THRESHOLD - 0.001)).toBe(null);
  });

  // The 0.75–0.85 band was the abandoned half of the review queue: topically
  // adjacent memories that were never duplicates.
  it("no longer flags the topically-adjacent band below 0.85", () => {
    expect(classifyDuplicate(0.75)).toBe(null);
    expect(classifyDuplicate(0.8)).toBe(null);
  });
});
