export const MEMORY_TYPES = ["correction", "preference", "decision", "learning", "fact"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const HARNESSES = ["claude-code", "copilot-cli", "codex", "opencode"] as const;
export type HarnessId = (typeof HARNESSES)[number];

export const PROMPT_IDS = ["control", "V1", "V2", "V3", "V4", "V5", "V6", "V7"] as const;
export type PromptId = (typeof PROMPT_IDS)[number];

export const PIN_STATES = ["empty", "populated"] as const;
export type PinState = (typeof PIN_STATES)[number];

export const LENGTH_BUCKETS = ["short", "medium", "long"] as const;
export type LengthBucket = (typeof LENGTH_BUCKETS)[number];

export const SCENARIO_CLASSES = ["decision", "tool-failure"] as const;
export type ScenarioClass = (typeof SCENARIO_CLASSES)[number];

export type AssistantContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export type UserContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type FixtureMessage =
  | { role: "user"; content: string | UserContentBlock[] }
  | { role: "assistant"; content: string | AssistantContentBlock[] };

export interface Scenario {
  id: string;
  class: ScenarioClass;
  lengthBucket: LengthBucket;
  expectedType: MemoryType;
  expectedContent: string;
  messages: FixtureMessage[];
}

export interface PromptVariant {
  id: PromptId;
  hypothesis: string;
  expectedFailureMode: string;
  text: string;
}

export interface PinnedMemory {
  content: string;
  type: MemoryType;
  scope: "global" | "project";
}

export interface RawRun {
  promptId: PromptId;
  scenarioId: string;
  harness: HarnessId;
  pinState: PinState;
  rep: number;
  startedAt: string;
  durationMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  saveCalls: Array<{ content: string; type: string; tags?: string[] }>;
  otherToolCalls: string[];
  textOutput: string;
  judge?: { intent: 0 | 0.5 | 1; fp: 0 | 1 };
  score?: number;
  error?: string;
}
