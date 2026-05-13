import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const SYNTHESIS_SYSTEM_PROMPT =
  "You are a memory synthesizer. Your job is to read the user's stored memories and produce a concise, well-structured summary of what's most important to remember about this user — their preferences, corrections, decisions, and key facts. Pinned memories are higher fidelity and should be weighted more heavily. Exclude transient or ephemeral details. Output plain text suitable for injection into an LLM context window. Be concise — target 200-400 words.";

const MAX_TURNS = 3;

export interface SynthesisConfig {
  enabled: boolean;
  maxTokensPerRun?: number;
  debounceMs?: number;
  stalenessDays?: number;
  inFlightTimeoutMs?: number;
}

interface SynthesisTools {
  queryMemory: (args: { query: string; limit?: number; global?: boolean }) => Promise<string>;
  getMemorySummary: () => Promise<string>;
}

export class SynthesisAgentLoop {
  readonly #tools: SynthesisTools;

  constructor(tools: SynthesisTools, _config: SynthesisConfig) {
    this.#tools = tools;
  }

  async run(scope: string): Promise<string> {
    const queryMemoryTool = tool(
      "query_memory",
      "Search memories by semantic similarity",
      {
        query: z.string().describe("Search text"),
        limit: z.number().optional().describe("Maximum results to return"),
        global: z
          .boolean()
          .optional()
          .describe("Query global memories only when true, otherwise current project scope"),
      },
      async ({ query: q, limit, global: isGlobal }) => {
        const result = await this.#tools.queryMemory({
          query: q,
          limit,
          global: isGlobal,
        });
        return { content: [{ type: "text" as const, text: result }] };
      },
      { annotations: { readOnlyHint: true } }
    );

    const getMemorySummaryTool = tool(
      "get_memory_summary",
      "Returns aggregate stats: total memories, counts by type, pinned count, review queue size",
      {},
      async () => {
        const result = await this.#tools.getMemorySummary();
        return { content: [{ type: "text" as const, text: result }] };
      },
      { annotations: { readOnlyHint: true } }
    );

    const mcpServer = createSdkMcpServer({
      name: "membank-synthesis-tools",
      version: "1.0.0",
      tools: [queryMemoryTool, getMemorySummaryTool],
    });

    const isGlobal = scope === "global";
    const scopeDescription = isGlobal ? "global (across all projects)" : `project scope: ${scope}`;

    const prompt = `Synthesize the memories for ${scopeDescription}. Use get_memory_summary first to understand the overall state, then use query_memory to retrieve relevant memories (query with broad terms like "preferences", "corrections", "decisions", "key facts"). After gathering information, produce a concise synthesis of the most important things to remember about this user. Output only the synthesis text — no preamble, no metadata.`;

    const startTime = Date.now();

    const env = Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
    );

    const agentQuery = query({
      prompt,
      options: {
        model: "claude-haiku-4-5-20251001",
        maxTurns: MAX_TURNS,
        systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
        mcpServers: { "membank-synthesis-tools": mcpServer },
        allowedTools: ["query_memory", "get_memory_summary"],
        permissionMode: "dontAsk",
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
    process.stderr.write(`membank synthesis: scope=${scope} duration=${durationMs}ms\n`);

    if (finalResult === "") {
      throw new Error("Synthesis agent returned empty result");
    }

    return finalResult;
  }
}
