import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ExtractionAgentRunner, ExtractionTools } from "../ports.js";

const EXTRACTION_SYSTEM_PROMPT = [
  "You are a memory extractor that runs after a coding session ends. You read the session transcript and CALL save_memory for every durable fact, preference, correction, decision, or learning the user expressed, so that future sessions inherit them.",
  "",
  "Memory types (pick the closest match):",
  "- correction: the user told the assistant to stop doing something or to do it differently.",
  "- preference: the user stated how they want work done (tools, style, conventions).",
  "- decision: the user committed to a choice future work should respect (tech pick, architectural direction, scope cut).",
  "- learning: a non-obvious fact about the codebase or tooling that future sessions would otherwise rediscover.",
  "- fact: stable info about the user or their project not derivable from the code.",
  "",
  "Bias strongly toward saving. If the user said it in plain language and it would be useful in a future session, save it. Phrasing like 'stop X', 'always Y', 'we use Z', 'don't suggest W', 'we decided', 'from now on' is a clear save signal — even when the assistant in the transcript already acknowledged it, save it so the NEXT session also knows.",
  "",
  "Process:",
  "1. Read the supplied transcript end-to-end.",
  "2. Identify every distinct durable signal. List them mentally before calling tools.",
  "3. Optional: call query_memory with focused search terms to avoid duplicates. If a near-duplicate exists, call update_memory instead of save_memory.",
  '4. Call save_memory for each new durable signal. Phrase the content as a standalone instruction or fact — strip session framing ("in this session", "just now"). Good: "Use pnpm, not npm, for all dependency operations." Bad: "User said stop using npm."',
  "5. Use `global: true` only when the fact is about the user themselves or applies across every project. Otherwise default to project scope (omit `global`).",
  "",
  "Only return without saving when the transcript truly contains no durable signal — pure greetings, time-of-day questions, abandoned tasks. Do not invent facts. If in doubt and the signal is concrete, save it.",
].join("\n");

class ClaudeExtractionAgentRunner implements ExtractionAgentRunner {
  readonly #tools: ExtractionTools;

  constructor(tools: ExtractionTools) {
    this.#tools = tools;
  }

  async run(args: { transcript: string; projectHash: string; sessionId: string }): Promise<void> {
    const queryMemoryTool = tool(
      "query_memory",
      "Search memories by semantic similarity to check for existing entries before saving.",
      {
        query: z.string().describe("Search text"),
        limit: z.number().optional().describe("Maximum results to return"),
        global: z
          .boolean()
          .optional()
          .describe("Query global memories when true, otherwise current project scope"),
      },
      async ({ query: q, limit, global: isGlobal }) => {
        const result = await this.#tools.queryMemory({
          query: q,
          limit,
          global: isGlobal,
          projectHash: args.projectHash,
        });
        return { content: [{ type: "text" as const, text: result }] };
      },
      { annotations: { readOnlyHint: true } }
    );

    const saveMemoryTool = tool(
      "save_memory",
      "Persist a new memory. The system handles dedup automatically.",
      {
        content: z.string().describe("Memory content — concise, decontextualised"),
        type: z
          .enum(["correction", "preference", "decision", "learning", "fact"])
          .describe("Memory type"),
        tags: z.array(z.string()).optional().describe("Optional tags"),
        global: z.boolean().optional().describe("Save as global memory rather than project-scoped"),
      },
      async ({ content, type, tags, global: isGlobal }) => {
        const result = await this.#tools.saveMemory({ content, type, tags, global: isGlobal });
        return { content: [{ type: "text" as const, text: result }] };
      }
    );

    const updateMemoryTool = tool(
      "update_memory",
      "Refine an existing memory by id rather than creating a near-duplicate.",
      {
        id: z.string().describe("Memory id"),
        content: z.string().optional(),
        type: z.enum(["correction", "preference", "decision", "learning", "fact"]).optional(),
        tags: z.array(z.string()).optional(),
      },
      async ({ id, content, type, tags }) => {
        const result = await this.#tools.updateMemory({ id, content, type, tags });
        return { content: [{ type: "text" as const, text: result }] };
      }
    );

    const mcpServer = createSdkMcpServer({
      name: "membank-extraction-tools",
      version: "1.0.0",
      tools: [queryMemoryTool, saveMemoryTool, updateMemoryTool],
    });

    const prompt = [
      `Session id: ${args.sessionId}`,
      "",
      "Transcript (most recent turns):",
      "---",
      args.transcript,
      "---",
      "",
      "Extract durable memories from this transcript following the system instructions.",
    ].join("\n");

    const env = Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
    );

    const startTime = Date.now();

    const agentQuery = query({
      prompt,
      options: {
        model: "claude-haiku-4-5-20251001",
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        mcpServers: { "membank-extraction-tools": mcpServer },
        allowedTools: [
          "mcp__membank-extraction-tools__query_memory",
          "mcp__membank-extraction-tools__save_memory",
          "mcp__membank-extraction-tools__update_memory",
        ],
        // Disallow the host's globally-configured membank MCP server, which would otherwise
        // shadow our in-process tools and read/write the user's real memory.db.
        disallowedTools: ["mcp__membank__*"],
        // Block inheriting Claude Code's user/project settings (which load the host's MCP
        // servers, slash commands, etc.). The extraction agent must only see what we pass.
        settingSources: [],
        permissionMode: "bypassPermissions",
        env,
      },
    });

    const debug = process.env.MEMBANK_EXTRACTION_DEBUG === "true";

    for await (const message of agentQuery) {
      if (debug) {
        process.stderr.write(`[extraction debug] ${JSON.stringify(message).slice(0, 600)}\n`);
      }
      if (message.type === "result") {
        if (message.subtype !== "success") {
          const details =
            "errors" in message && Array.isArray(message.errors)
              ? `: ${message.errors.join("; ")}`
              : "";
          throw new Error(`Extraction agent failed: ${message.subtype}${details}`);
        }
      }
    }

    const durationMs = Date.now() - startTime;
    process.stderr.write(
      `membank extraction: session=${args.sessionId} duration=${durationMs}ms\n`
    );
  }
}

export function createExtractionAgentRunner(tools: ExtractionTools): ExtractionAgentRunner {
  return new ClaudeExtractionAgentRunner(tools);
}
