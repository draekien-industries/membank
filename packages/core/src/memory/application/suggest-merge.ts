import { query } from "@anthropic-ai/claude-agent-sdk";

const SYSTEM_PROMPT =
  "You are a memory merge assistant. Given multiple memory entries identified as similar or overlapping, produce one concise merged memory that preserves all important information without redundancy. Output only the merged memory text — no preamble, no explanation, no metadata.";

export async function suggestMerge(contents: readonly string[]): Promise<string> {
  const entries = contents.map((c, i) => `Memory ${i + 1}:\n${c}`).join("\n\n---\n\n");

  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
  );

  const agentQuery = query({
    prompt: `Merge these memory entries into one concise memory:\n\n${entries}`,
    options: {
      model: "claude-haiku-4-5-20251001",
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: [],
      settingSources: [],
      permissionMode: "bypassPermissions",
      env,
    },
  });

  let result = "";
  for await (const message of agentQuery) {
    if (message.type === "result" && message.subtype === "success") {
      result = message.result;
    }
  }

  if (!result) throw new Error("Merge suggestion returned empty result");
  return result;
}
