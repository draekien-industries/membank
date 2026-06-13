import { describe, expect, it } from "vitest";
import { countWords } from "./word-count.js";

describe("countWords", () => {
  it("returns 0 for no memories", () => {
    expect(countWords([])).toBe(0);
  });

  it("counts words across multiple memories", () => {
    expect(countWords(["one two three", "four five"])).toBe(5);
  });

  it("collapses runs of whitespace and ignores leading/trailing space", () => {
    expect(countWords(["  one   two\tthree\nfour  "])).toBe(4);
  });

  it("ignores empty and whitespace-only memories", () => {
    expect(countWords(["", "   ", "word"])).toBe(1);
  });

  it("is deterministic for the same input", () => {
    const input = ["alpha beta", "gamma"];
    expect(countWords(input)).toBe(countWords(input));
  });
});
