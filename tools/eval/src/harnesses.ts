import type Anthropic from "@anthropic-ai/sdk";
import { POPULATED_PINS, POPULATED_STATS } from "./scenarios/pin-fixtures.js";
import type { FixtureMessage, HarnessId, PinState, PromptVariant } from "./types.js";

const SYSTEM_BASE =
  "You are an expert software engineering assistant working with the user inside a CLI agent harness. You have access to tools for running shell commands, fetching URLs, reading files, and persisting cross-session memory. Use the tools when they help — do not announce what you are about to do unless the user asks. Match the user's level of technical detail.";

function statsLine(pinState: PinState): string {
  if (pinState === "empty") return "[Memory Stats]: no memories saved yet";
  const parts = (Object.entries(POPULATED_STATS) as [string, number][])
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? "s" : ""}`);
  return `[Memory Stats]: ${parts.join(", ")}`;
}

function pinnedLines(pinState: PinState): string[] {
  if (pinState === "empty") return [];
  return POPULATED_PINS.map((m) => {
    const tag = m.scope === "global" ? "[Pinned Global]" : "[Pinned Project]";
    return `${tag}: "${m.content}" (${m.type})`;
  });
}

export function buildFormatContextText(prompt: PromptVariant, pinState: PinState): string {
  const lines: string[] = [statsLine(pinState), ...pinnedLines(pinState), prompt.text];
  return lines.join("\n");
}

function asMessageParams(messages: FixtureMessage[]): Anthropic.Messages.MessageParam[] {
  return messages as Anthropic.Messages.MessageParam[];
}

export interface BuiltRequest {
  system: Array<Anthropic.Messages.TextBlockParam>;
  messages: Anthropic.Messages.MessageParam[];
}

export function buildRequest(
  harness: HarnessId,
  prompt: PromptVariant,
  pinState: PinState,
  scenarioMessages: FixtureMessage[]
): BuiltRequest {
  const ctx = buildFormatContextText(prompt, pinState);
  const baseSystem: Anthropic.Messages.TextBlockParam = {
    type: "text",
    text: SYSTEM_BASE,
    cache_control: { type: "ephemeral" },
  };

  switch (harness) {
    case "claude-code": {
      return {
        system: [baseSystem],
        messages: [
          {
            role: "user",
            content: `<system-reminder>\n${ctx}\n</system-reminder>`,
          },
          ...asMessageParams(scenarioMessages),
        ],
      };
    }
    case "copilot-cli": {
      return {
        system: [baseSystem, { type: "text", text: ctx }],
        messages: asMessageParams(scenarioMessages),
      };
    }
    case "codex": {
      return {
        system: [baseSystem],
        messages: [{ role: "user", content: ctx }, ...asMessageParams(scenarioMessages)],
      };
    }
    case "opencode": {
      return {
        system: [baseSystem, { type: "text", text: `[session context]\n${ctx}` }],
        messages: asMessageParams(scenarioMessages),
      };
    }
  }
}
