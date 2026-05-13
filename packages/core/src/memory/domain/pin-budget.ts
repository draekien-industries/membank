export const PIN_BUDGET_THRESHOLD = 8000;

export function isOverBudget(pinnedCharCount: number): boolean {
  return pinnedCharCount >= PIN_BUDGET_THRESHOLD;
}
