import type { PinnedMemory } from "../types.js";

export const POPULATED_PINS: PinnedMemory[] = [
  {
    content: "Use Tab characters for indentation in any Python file.",
    type: "preference",
    scope: "global",
  },
  {
    content: "All packages in this repo are ESM-only; never write CommonJS.",
    type: "decision",
    scope: "project",
  },
  {
    content:
      "Running pnpm install from a subdirectory is fine — corepack picks the right pnpm version automatically.",
    type: "learning",
    scope: "project",
  },
];

export const POPULATED_STATS = {
  correction: 4,
  preference: 2,
  decision: 7,
  learning: 11,
  fact: 0,
};
