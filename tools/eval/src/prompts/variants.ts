import type { PromptVariant } from "../types.js";

export const VARIANTS: Record<string, PromptVariant> = {
  control: {
    id: "control",
    hypothesis: "Current production cost-of-omission framing is close to optimal.",
    expectedFailureMode:
      "Counterfactual-regret framing requires forward simulation — Haiku may not act on it. User-initiated wording misses Claude-discovered learnings from tool failures.",
    text: "[Memory Guidance]: Persistent memory is available via query_memory, save_memory, update_memory, delete_memory. Skipping save_memory when the user gives a correction or preference means they have to repeat themselves next session — that is the failure mode to avoid. Skipping query_memory on topics that touch prior decisions means contradicting yourself. Default to saving (type: correction|preference|decision|learning|fact) when in doubt; rely on dedup to handle redundancy. Pin anything that should appear at every session start.",
  },
  V1: {
    id: "V1",
    hypothesis: "Brevity + imperative voice survives long-context decay better than dense prose.",
    expectedFailureMode:
      "May under-save fact and learning types not named in the trigger; loses nuance.",
    text: "[Memory Guidance]: After any user decision/preference/correction, or after you discover a fix or workaround, call save_memory immediately. Call query_memory before answering questions that touch prior decisions.",
  },
  V2: {
    id: "V2",
    hypothesis:
      "Explicit enumerated triggers beat prose; covers Claude-discovered learnings the control misses.",
    expectedFailureMode:
      "Brittle on edge cases that don't pattern-match a listed trigger; possible over-saving on trivia.",
    text: "[Memory Guidance]: Call save_memory when ANY of these happen: (1) user states a preference or makes a decision; (2) user corrects you; (3) you discover a working fix after a tool error; (4) you learn a non-obvious project fact. Type ∈ correction|preference|decision|learning|fact. Call query_memory before answering anything that might touch prior decisions. When unsure, save.",
  },
  V3: {
    id: "V3",
    hypothesis: "Concrete I/O examples beat abstraction for weak reasoners.",
    expectedFailureMode:
      "Pattern-matches example surface; saves only things that look syntactically like the example, misses semantic neighbours.",
    text: '[Memory Guidance]: Persist learnings via save_memory. Examples:\n– User: "always use pnpm here" → save_memory(content="Use pnpm in this project", type="preference")\n– Tool error: ENOENT on .env → fix by copying .env.example → save_memory(content="Run cp .env.example .env after clone", type="learning")\nCall query_memory before any answer that touches prior decisions. When unsure, save.',
  },
  V4: {
    id: "V4",
    hypothesis: "Stateful-self framing produces the trigger via role consistency.",
    expectedFailureMode:
      "Identity sticks for early turns then erodes; no concrete trigger so saves cluster on first turns and stop.",
    text: "[Memory Guidance]: You are a stateful assistant. save_memory and query_memory are how your memory works across sessions. If you don't call save_memory, the insight is lost when this session ends.",
  },
  V5: {
    id: "V5",
    hypothesis:
      "An internal check-step instruction scaffolds reasoning closest to chain-of-thought.",
    expectedFailureMode:
      "Self-check fires on early turns but Haiku stops actually performing it after ~10 turns.",
    text: '[Memory Guidance]: Before ending each turn, ask yourself: "Did the user just decide/prefer/correct something, or did I just learn something that would help next session?" If yes, call save_memory now. If the user\'s question touches prior decisions, call query_memory first.',
  },
  V6: {
    id: "V6",
    hypothesis: "Concrete-end framing beats abstract future regret.",
    expectedFailureMode:
      "Loss salience decays; Haiku may save eagerly turn-1 then ignore later. Slightly off-truth (sessions don't literally delete) which Haiku may discount.",
    text: "[Memory Guidance]: This conversation ends and is deleted. Only what you save with save_memory survives. Save user decisions, preferences, corrections, and any fix you discover.",
  },
  V7: {
    id: "V7",
    hypothesis: "Triggers + a single example beats either alone — a-priori favourite for Haiku.",
    expectedFailureMode:
      "If this loses to V2, the example is noise; if it loses to V3, the trigger list crowded out pattern matching.",
    text: '[Memory Guidance]: Call save_memory when: (1) user states preference/decision; (2) user corrects you; (3) you discover a fix after a tool error; (4) you learn a non-obvious project fact. Example: tool fails with ENOENT, you fix with cp .env.example .env → save_memory(content="...", type="learning"). Call query_memory before answering anything touching prior decisions.',
  },
};
