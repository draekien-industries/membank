import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ExtractionAgentRunner, ExtractionTools } from "../ports.js";

const EXTRACTION_SYSTEM_PROMPT = [
  "You are a memory extractor that runs after a coding session ends. You read the session transcript and call save_memory for the stable, long-term facts, preferences, corrections, decisions, and learnings the user expressed — the ones future sessions should inherit. You deliberately skip anything tied to the current task.",
  "",
  "Memory types (pick the closest match):",
  "- correction: the user told the assistant to stop doing something or to do it differently.",
  "- preference: the user stated how they want work done (tools, style, conventions).",
  "- decision: the user committed to a choice future work should respect (tech pick, architectural direction, scope cut).",
  "- learning: a non-obvious, durable fact about the codebase or tooling — a gotcha, external constraint, or counterintuitive behavior a future session could NOT discover just by reading the current code. A bug you fixed or a change you made this session is NOT a learning.",
  "- fact: stable info about the user or their project not derivable from the code.",
  "",
  "Save a memory ONLY if it would still be true and useful weeks from now, in a different task. Ask of each candidate: is this about HOW the user works in general, or only about the task happening right now? Save the former, skip the latter.",
  "",
  "DO NOT save:",
  "- completed-action records: what was fixed/added/removed/changed this session ('fixed the bug in X', 'migration N removed Y', 'the dashboard now does Z'). Do not relabel a fix as a learning or a 'should use Y' rule to get around this — if the detail lives in the code, the code is the source of truth, not a memory.",
  "- the status or details of the current task, bug, or PR, including TODOs and 'remains unimplemented / requires follow-up' notes.",
  "- facts derivable from the current code: component locations, exact counts, specific values applied to named files.",
  "- anything phrased as 'for now', 'in this session', 'just this once'.",
  "",
  "Decisions and learnings are the easiest to get wrong here — only save them when they capture lasting project direction or a non-obvious fact that survives the code changing, not a description of the change you just made.",
  "",
  "Standing-rule phrasing — 'stop X', 'always Y', 'we use Z', 'don't suggest W', 'we decided', 'from now on' — is a strong save signal even if the assistant already acknowledged it, because the NEXT session won't know.",
  "",
  "Process:",
  "1. Read the supplied transcript end-to-end.",
  "2. Identify only the signals that pass the durability test. List them mentally before calling tools.",
  "3. Before calling save_memory for a candidate, call query_memory with focused search terms to check for an existing near-duplicate. If one exists, call update_memory instead of save_memory.",
  '4. Call save_memory for each new durable signal. Phrase the content as a standalone instruction or fact — strip session framing. Good: "Use pnpm, not npm, for all dependency operations." Bad: "User said stop using npm." Bad: "query_memory should use scopeToProjectHash for global scope" (that only describes a fix you just made — the code already encodes it).',
  "5. Use `global: true` only when the fact is about the user themselves or applies across every project. Otherwise default to project scope (omit `global`).",
  "",
  "When the transcript contains no stable signal — pure greetings, time-of-day questions, abandoned tasks, or only task-specific work — return without saving. Do not invent facts. When in doubt, do NOT save.",
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
          ...(limit !== undefined && { limit }),
          ...(isGlobal !== undefined && { global: isGlobal }),
          ...(args.projectHash !== undefined && { projectHash: args.projectHash }),
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
        const result = await this.#tools.saveMemory({
          content,
          type,
          ...(tags !== undefined && { tags }),
          ...(isGlobal !== undefined && { global: isGlobal }),
        });
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
        const result = await this.#tools.updateMemory({
          id,
          ...(content !== undefined && { content }),
          ...(type !== undefined && { type }),
          ...(tags !== undefined && { tags }),
        });
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
