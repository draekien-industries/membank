import type { PromptId, PromptVariant } from "../types.js";
import { VARIANTS } from "./variants.js";

export function getPrompt(id: PromptId): PromptVariant {
  const variant = VARIANTS[id];
  if (!variant) {
    throw new Error(`Unknown prompt id: ${id}`);
  }
  return variant;
}

export function listPrompts(): PromptVariant[] {
  return Object.values(VARIANTS);
}

export { VARIANTS };
