import { describe, expect, it } from "vitest";
import { FORBIDDEN_SAVE_HINTS, flattenScenarioText, SCENARIOS } from "./index.js";

describe("scenario fixtures", () => {
  it("exports 16 scenarios (8 decisions + 8 tool-failures)", () => {
    expect(SCENARIOS.length).toBe(16);
    expect(SCENARIOS.filter((s) => s.class === "decision").length).toBe(8);
    expect(SCENARIOS.filter((s) => s.class === "tool-failure").length).toBe(8);
  });

  it("has unique scenario ids", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all length buckets", () => {
    const buckets = new Set(SCENARIOS.map((s) => s.lengthBucket));
    expect(buckets).toEqual(new Set(["short", "medium", "long"]));
  });

  it("contains no explicit save-hint phrases", () => {
    const offences: string[] = [];
    for (const s of SCENARIOS) {
      const text = flattenScenarioText(s);
      for (const pattern of FORBIDDEN_SAVE_HINTS) {
        if (pattern.test(text)) {
          offences.push(`${s.id}: matched ${pattern}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("ends every scenario with a non-save-hinting user turn", () => {
    for (const s of SCENARIOS) {
      const last = s.messages[s.messages.length - 1];
      expect(last?.role).toBe("user");
    }
  });
});
