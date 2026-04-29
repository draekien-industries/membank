import type Anthropic from "@anthropic-ai/sdk";
import { getClient, HAIKU_MODEL, withRetry } from "./anthropic.js";
import { buildRequest } from "./harnesses.js";
import { getPrompt } from "./prompts/index.js";
import { getScenario } from "./scenarios/index.js";
import { ALL_TOOLS } from "./tools.js";
import type { HarnessId, PinState, PromptId, RawRun } from "./types.js";

export interface RunArgs {
  promptId: PromptId;
  scenarioId: string;
  harness: HarnessId;
  pinState: PinState;
  rep: number;
}

export async function runOne(args: RunArgs): Promise<RawRun> {
  const { promptId, scenarioId, harness, pinState, rep } = args;
  const prompt = getPrompt(promptId);
  const scenario = getScenario(scenarioId);
  const built = buildRequest(harness, prompt, pinState, scenario.messages);

  const startedAt = new Date().toISOString();
  const startMs = performance.now();
  const label = `${promptId}/${scenarioId}/${harness}/${pinState}#${rep}`;

  try {
    const response = await withRetry(
      () =>
        getClient().messages.create({
          model: HAIKU_MODEL,
          max_tokens: 1024,
          temperature: 0.7,
          system: built.system,
          tools: ALL_TOOLS as unknown as Anthropic.Messages.Tool[],
          tool_choice: { type: "auto" },
          messages: built.messages,
        }),
      label
    );

    const durationMs = Math.round(performance.now() - startMs);

    const saveCalls: RawRun["saveCalls"] = [];
    const otherToolCalls: string[] = [];
    let textOutput = "";

    for (const block of response.content) {
      if (block.type === "text") {
        textOutput += block.text;
      } else if (block.type === "tool_use") {
        if (block.name === "save_memory") {
          const input = block.input as { content?: string; type?: string; tags?: string[] };
          saveCalls.push({
            content: input.content ?? "",
            type: input.type ?? "",
            tags: input.tags,
          });
        } else {
          otherToolCalls.push(block.name);
        }
      }
    }

    const usage = response.usage as Anthropic.Messages.Usage & {
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };

    return {
      promptId,
      scenarioId,
      harness,
      pinState,
      rep,
      startedAt,
      durationMs,
      inputTokens: usage.input_tokens ?? 0,
      cachedInputTokens: usage.cache_read_input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      saveCalls,
      otherToolCalls,
      textOutput,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - startMs);
    return {
      promptId,
      scenarioId,
      harness,
      pinState,
      rep,
      startedAt,
      durationMs,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      saveCalls: [],
      otherToolCalls: [],
      textOutput: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
