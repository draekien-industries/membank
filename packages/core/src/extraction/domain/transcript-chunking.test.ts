import { describe, expect, it } from "vitest";
import { chunkTurns } from "./transcript-chunking.js";

describe("chunkTurns", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkTurns([])).toEqual([]);
  });

  it("keeps turns that fit within the budget in a single chunk", () => {
    const turns = ["user: hi", "assistant: hello", "user: thanks"];
    expect(chunkTurns(turns, 1_000)).toEqual([turns.join("\n\n")]);
  });

  it("splits on turn boundaries when combining turns would exceed the budget", () => {
    const turns = ["user: aaaa", "assistant: bbbb", "user: cccc"];
    const chunks = chunkTurns(turns, 15);
    expect(chunks).toEqual(["user: aaaa", "assistant: bbbb", "user: cccc"]);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(15);
  });

  it("packs as many whole turns as fit before starting a new chunk", () => {
    const turns = ["aaa", "bbb", "ccc", "ddd"];
    const chunks = chunkTurns(turns, 8);
    expect(chunks).toEqual(["aaa\n\nbbb", "ccc\n\nddd"]);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(8);
  });

  it("hard-slices a single turn larger than the budget", () => {
    const big = "x".repeat(25);
    const chunks = chunkTurns(["user: ok", big, "bye"], 10);
    expect(chunks).toEqual(["user: ok", "x".repeat(10), "x".repeat(10), "x".repeat(5), "bye"]);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(10);
  });
});
