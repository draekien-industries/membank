import type { Scenario } from "../types.js";
import { DECISIONS } from "./decisions.js";
import { TOOL_FAILURES } from "./tool-failure.js";

export const SCENARIOS: Scenario[] = [...DECISIONS, ...TOOL_FAILURES];

export function getScenario(id: string): Scenario {
  const s = SCENARIOS.find((s) => s.id === id);
  if (!s) {
    throw new Error(`Unknown scenario id: ${id}`);
  }
  return s;
}

export const FORBIDDEN_SAVE_HINTS = [
  /\bremember\b/i,
  /\bsave\s+(this|that|it)\b/i,
  /\bnote\s+(this|that|it)\b/i,
  /\bfor\s+next\s+time\b/i,
  /\bmake\s+sure\s+to\b/i,
  /\bwrite\s+(this|that|it)\s+down\b/i,
  /\bdon't\s+forget\b/i,
  /\bkeep\s+in\s+mind\b/i,
  /\bcommit\s+to\s+memory\b/i,
];

export function flattenScenarioText(s: Scenario): string {
  const parts: string[] = [];
  for (const m of s.messages) {
    if (typeof m.content === "string") {
      parts.push(m.content);
    } else {
      for (const block of m.content) {
        if (block.type === "text") parts.push(block.text);
        else if (block.type === "tool_use") parts.push(JSON.stringify(block.input));
        else if (block.type === "tool_result") parts.push(block.content);
      }
    }
  }
  return parts.join("\n");
}
