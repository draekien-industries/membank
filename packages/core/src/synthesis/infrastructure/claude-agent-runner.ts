import { query } from "@anthropic-ai/claude-agent-sdk";
import { GLOBAL_SCOPE_HASH } from "../../project/domain/global-scope.js";
import type { MemoryType } from "../../schemas.js";
import type { AgentRunner, SynthesisConfig, SynthesisTools } from "../ports.js";

const SYNTHESIS_SYSTEM_PROMPT =
  "You are a memory synthesizer. You are given the user's stored memories of a single kind, and your job is to produce a concise, well-structured summary of what's most important to remember from them. Synthesize only the memories you are given — do not invent, infer, or recall anything else. Exclude transient or ephemeral details. Output plain text suitable for injection into an LLM context window. Be concise — target 100-250 words.";

const MEMORY_TYPE_DESCRIPTIONS: Record<MemoryType, string> = {
  correction: "corrections the user has made to the assistant's behaviour",
  preference: "the user's stated preferences",
  decision: "decisions the user has made",
  learning: "things the assistant has learned about the user or their work",
  fact: "stable facts about the user or their work",
};

class ClaudeAgentRunner implements AgentRunner {
  async run(scope: string, type: MemoryType, memories: readonly string[]): Promise<string> {
    const isGlobal = scope === GLOBAL_SCOPE_HASH;
    const scopeDescription = isGlobal ? "global (across all projects)" : `project scope: ${scope}`;

    const numbered = memories.map((content, index) => `${index + 1}. ${content}`).join("\n");

    const prompt = `Synthesize the following ${MEMORY_TYPE_DESCRIPTIONS[type]} for ${scopeDescription}. Produce a concise synthesis of the most important things to remember. Output only the synthesis text — no preamble, no metadata.\n\nMemories:\n${numbered}`;

    const startTime = Date.now();

    const env = Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
    );

    const agentQuery = query({
      prompt,
      options: {
        model: "claude-haiku-4-5-20251001",
        systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
        // The synthesis agent must only see the memories embedded in the prompt — no tools,
        // so it cannot reach the host's membank MCP server and read pinned or other memories.
        allowedTools: [],
        disallowedTools: ["mcp__membank__*"],
        // Block inheriting Claude Code's user/project settings (which load the host's MCP
        // servers, slash commands, etc.). The synthesis agent must only see what we pass.
        settingSources: [],
        permissionMode: "bypassPermissions",
        env,
      },
    });

    let finalResult = "";

    for await (const message of agentQuery) {
      if (message.type === "result") {
        if (message.subtype === "success") {
          finalResult = message.result;
        } else {
          const details =
            "errors" in message && Array.isArray(message.errors)
              ? `: ${message.errors.join("; ")}`
              : "";
          throw new Error(`Synthesis agent failed: ${message.subtype}${details}`);
        }
      }
    }

    const durationMs = Date.now() - startTime;
    process.stderr.write(
      `membank synthesis: scope=${scope} type=${type} duration=${durationMs}ms\n`
    );

    if (finalResult === "") {
      throw new Error("Synthesis agent returned empty result");
    }

    return finalResult;
  }
}

export function createSynthesisAgentRunner(
  _tools: SynthesisTools,
  _config: SynthesisConfig
): AgentRunner {
  return new ClaudeAgentRunner();
}
