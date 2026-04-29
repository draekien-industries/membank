import type Anthropic from "@anthropic-ai/sdk";
import { getClient, JUDGE_MODEL, withRetry } from "../anthropic.js";
import { getScenario } from "../scenarios/index.js";
import type { RawRun } from "../types.js";

interface JudgeVerdict {
  intent: 0 | 0.5 | 1;
  fp: 0 | 1;
  reason?: string;
}

const SYSTEM_PROMPT =
  'You are a precise grader for a memory-saving eval. The model under test (Haiku) was shown a conversation that ended in a save-worthy moment, then optionally called save_memory. Your job is to grade two binary-ish dimensions about the save call(s):\n\n1. INTENT: did any save_memory call capture the save-worthy moment as a paraphrase?\n   - 1 = clearly captures the moment\n   - 0.5 = partially captures (close but missing key detail, or overly verbose verbatim quoting)\n   - 0 = does not capture the moment\n\n2. FP (false positive): did the model save anything UNRELATED to the save-worthy moment?\n   - 1 = no false positives\n   - 0 = at least one save is incidental fluff (not the target)\n\nIf no save calls were made at all, return intent=0 and fp=1 (no FPs by virtue of no saves).\n\nRespond with strict JSON only: {"intent": 0 | 0.5 | 1, "fp": 0 | 1, "reason": "<one sentence>"}';

export async function judgeRun(run: RawRun): Promise<JudgeVerdict> {
  if (run.error) return { intent: 0, fp: 1, reason: "run errored" };

  const scenario = getScenario(run.scenarioId);
  const userMessage = [
    `Save-worthy moment: ${scenario.expectedContent}`,
    `Expected memory type: ${scenario.expectedType}`,
    "",
    "Save calls made by the model:",
    run.saveCalls.length === 0
      ? "(none)"
      : run.saveCalls
          .map(
            (c, i) =>
              `${i + 1}. type=${c.type}, content=${JSON.stringify(c.content)}${
                c.tags ? `, tags=${JSON.stringify(c.tags)}` : ""
              }`
          )
          .join("\n"),
    "",
    "Grade and return JSON.",
  ].join("\n");

  const response = await withRetry(
    () =>
      getClient().messages.create({
        model: JUDGE_MODEL,
        max_tokens: 200,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessage }],
      }),
    `judge:${run.promptId}/${run.scenarioId}`
  );

  const text = response.content
    .filter(
      (b: Anthropic.Messages.ContentBlock): b is Anthropic.Messages.TextBlock => b.type === "text"
    )
    .map((b) => b.text)
    .join("");

  return parseVerdict(text);
}

function parseVerdict(text: string): JudgeVerdict {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { intent: 0, fp: 1, reason: `unparseable: ${text.slice(0, 80)}` };
  try {
    const parsed = JSON.parse(match[0]) as Partial<JudgeVerdict>;
    const intent = parsed.intent === 1 ? 1 : parsed.intent === 0.5 ? 0.5 : 0;
    const fp = parsed.fp === 0 ? 0 : 1;
    return { intent, fp, reason: parsed.reason };
  } catch {
    return { intent: 0, fp: 1, reason: `JSON parse failed: ${text.slice(0, 80)}` };
  }
}
