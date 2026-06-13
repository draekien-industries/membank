import { describe, expect, it } from "vitest";
import { decideSynthesis } from "./synthesis-threshold.js";

describe("decideSynthesis", () => {
  it("injects verbatim just below the threshold", () => {
    expect(decideSynthesis(149, 150)).toEqual({ kind: "verbatim" });
  });

  it("synthesizes at the threshold", () => {
    expect(decideSynthesis(150, 150)).toEqual({ kind: "synthesize" });
  });

  it("synthesizes just above the threshold", () => {
    expect(decideSynthesis(151, 150)).toEqual({ kind: "synthesize" });
  });

  it("respects a non-default configured threshold", () => {
    expect(decideSynthesis(50, 40)).toEqual({ kind: "synthesize" });
    expect(decideSynthesis(30, 40)).toEqual({ kind: "verbatim" });
  });

  it("is deterministic for the same input", () => {
    expect(decideSynthesis(100, 150)).toEqual(decideSynthesis(100, 150));
  });
});
