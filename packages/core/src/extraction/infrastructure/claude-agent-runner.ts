import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  ACTIONABILITY_VALUES,
  DERIVABILITY_VALUES,
  DURABILITY_VALUES,
  decideAdmission,
  explainRejection,
} from "../domain/admission-policy.js";
import { detectContentSmells } from "../domain/content-smells.js";
import type {
  ExtractionAgentRunner,
  ExtractionTools,
  RejectedCandidateRepository,
} from "../ports.js";

const EXTRACTION_SYSTEM_PROMPT = [
  "You are a memory extractor that runs after a coding session ends. You read the session transcript and call save_memory for the stable, long-term facts, preferences, corrections, decisions, and learnings the user expressed — the ones future sessions should inherit. You deliberately skip anything tied to the current task.",
  "",
  "Memory types (pick the closest match):",
  "- correction: the user told the assistant to stop doing something or to do it differently.",
  "- preference: the user stated how they want work done (tools, style, conventions).",
  "- decision: the user committed to a choice future work should respect (tech pick, architectural direction, scope cut).",
  "- learning: a non-obvious, durable fact about the codebase or tooling — a gotcha, external constraint, or counterintuitive behavior.",
  "- fact: stable info about the user or their project not derivable from the code.",
  "",
  "Every save_memory call must classify the candidate on three axes and quote its evidence. The system decides admission from your classification, so classify honestly — a candidate you mislabel to get it past the gate is a memory that will waste a future session's context.",
  "",
  "durability — will this outlive the current task?",
  "- permanent: true independently of the codebase's current state (an external system's behaviour, a fact about the user).",
  "- stable: true until someone deliberately decides otherwise (a convention, a tech choice).",
  "- volatile: tied to this task, PR, or branch. 'For now', 'remains unimplemented', 'requires follow-up'.",
  "",
  "derivability — could a future session just look this up?",
  "- hidden: not learnable from the repo at all (a user preference, an external constraint).",
  "- costly: learnable, but only by debugging or reading external sources.",
  "- trivial: one file read or one grep away. Component locations, config values, which linter the repo uses.",
  "",
  "actionability — would it change what a future session does?",
  "- directive: changes what the session DOES ('use pnpm, never npm').",
  "- constraint: bounds what it MAY do ('never run electron-builder locally').",
  "- context: describes state without implying an action.",
  "",
  "evidence: a verbatim span from the transcript that supports the memory. If you cannot quote it, you are inventing it — do not save it.",
  "",
  'Worked examples. "Postgres GUC placeholders reset to \'\' not NULL on a pooled connection" → permanent / hidden / constraint. "Always use conventional commit format" → stable / hidden / directive. "Biome 2.x is the linter for this repo" → stable / trivial / context: still true, but one glance at the config file teaches it. "Fixed the scope resolver to hash the remote URL" → volatile / trivial / context: a description of a change, and the code already encodes it.',
  "",
  "Standing-rule phrasing — 'stop X', 'always Y', 'we use Z', 'don't suggest W', 'we decided', 'from now on' — is a strong save signal even if the assistant already acknowledged it, because the NEXT session won't know.",
  "",
  "Process:",
  "1. Read the supplied transcript end-to-end.",
  "2. List the candidate signals mentally, with their three-axis classification and the quote backing each.",
  "3. Before calling save_memory for a candidate, call query_memory with focused search terms to check for an existing near-duplicate. If one exists, call update_memory instead of save_memory.",
  '4. Call save_memory for each candidate. Phrase the content as a standalone instruction or fact — strip session framing. Good: "Use pnpm, not npm, for all dependency operations." Bad: "User said stop using npm."',
  "5. Use `global: true` only when the fact is about the user themselves or applies across every project. Otherwise default to project scope (omit `global`).",
  "",
  "When save_memory returns a rejection, do not re-propose the same candidate with a different classification. Move on.",
  "",
  "When the transcript contains no stable signal — pure greetings, time-of-day questions, abandoned tasks, or only task-specific work — return without saving. Do not invent facts. When in doubt, do NOT save.",
].join("\n");

class ClaudeExtractionAgentRunner implements ExtractionAgentRunner {
  readonly #tools: ExtractionTools;
  readonly #rejections: RejectedCandidateRepository;

  constructor(tools: ExtractionTools, rejections: RejectedCandidateRepository) {
    this.#tools = tools;
    this.#rejections = rejections;
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
      "Propose a new memory. The system applies an admission gate to your classification and handles dedup automatically.",
      {
        content: z.string().describe("Memory content — concise, decontextualised"),
        type: z
          .enum(["correction", "preference", "decision", "learning", "fact"])
          .describe("Memory type"),
        durability: z
          .enum(DURABILITY_VALUES)
          .describe("permanent | stable | volatile — see the system prompt"),
        derivability: z
          .enum(DERIVABILITY_VALUES)
          .describe("hidden | costly | trivial — see the system prompt"),
        actionability: z
          .enum(ACTIONABILITY_VALUES)
          .describe("directive | constraint | context — see the system prompt"),
        evidence: z.string().describe("Verbatim span from the transcript supporting this memory"),
        tags: z.array(z.string()).optional().describe("Optional tags"),
        global: z.boolean().optional().describe("Save as global memory rather than project-scoped"),
      },
      async ({
        content,
        type,
        durability,
        derivability,
        actionability,
        evidence,
        tags,
        global: isGlobal,
      }) => {
        const decision = decideAdmission({
          content,
          type,
          durability,
          derivability,
          actionability,
          evidence,
        });

        if (decision.kind === "reject") {
          this.#rejections.record(
            {
              content,
              type,
              durability,
              derivability,
              actionability,
              evidenceQuote: evidence,
              rejectedClause: decision.clause,
              smells: detectContentSmells(content),
              sessionId: args.sessionId,
              projectHash: args.projectHash,
            },
            new Date()
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Not saved (${decision.clause}): ${explainRejection(decision.clause)}`,
              },
            ],
          };
        }

        const result = await this.#tools.saveMemory({
          content,
          type,
          durability,
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

export function createExtractionAgentRunner(
  tools: ExtractionTools,
  rejections: RejectedCandidateRepository
): ExtractionAgentRunner {
  return new ClaudeExtractionAgentRunner(tools, rejections);
}
