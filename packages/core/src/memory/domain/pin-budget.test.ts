import { describe, expect, it } from "vitest";
import { isOverBudget, PIN_BUDGET_THRESHOLD } from "./pin-budget.js";

describe("isOverBudget", () => {
  it("returns false when char count is below threshold", () => {
    expect(isOverBudget(0)).toBe(false);
    expect(isOverBudget(PIN_BUDGET_THRESHOLD - 1)).toBe(false);
  });

  it("returns true at exactly the threshold", () => {
    expect(isOverBudget(PIN_BUDGET_THRESHOLD)).toBe(true);
  });

  it("returns true above the threshold", () => {
    expect(isOverBudget(PIN_BUDGET_THRESHOLD + 1)).toBe(true);
    expect(isOverBudget(99999)).toBe(true);
  });
});
