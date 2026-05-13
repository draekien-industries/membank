import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";
import { afterEach, describe, expect, it } from "vitest";
import type { CoreServices } from "./server.js";
import { createServer, initCore } from "./server.js";

async function startInProcess(): Promise<{
  client: Client;
  core: CoreServices;
  cleanup: () => Promise<void>;
}> {
  const core = initCore({ useInMemoryDb: true });
  const server = createServer(core);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" }, { capabilities: {} });
  await client.connect(clientTransport);

  return {
    client,
    core,
    cleanup: async () => {
      await client.close();
      await server.close();
      core.db.close();
    },
  };
}

describe("query_memory tool", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup !== undefined) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it("is listed in the tools manifest", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const result = await session.client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("query_memory");
  });

  it("happy path returns results ranked by score with required fields", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await session.core.repo.save({
      content: "prefer dark mode in all editors",
      type: "preference",
    });
    await session.core.repo.save({
      content: "always use TypeScript strict mode",
      type: "preference",
    });

    const result = await session.client.callTool({
      name: "query_memory",
      arguments: { query: "editor theme settings", global: true },
    });

    expect(result.content).toHaveLength(1);
    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    expect(block).toMatchObject({ type: "text" });

    const parsed = JSON.parse((block as { type: string; text: string }).text) as Array<{
      id: string;
      content: string;
      type: string;
      tags: string[];
      projects: { id: string; name: string; scopeHash: string }[];
      pinned: boolean;
      createdAt: string;
      updatedAt: string;
      sourceHarness: string | null;
      score: number;
    }>;

    expect(parsed.length).toBeGreaterThan(0);
    for (const item of parsed) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("content");
      expect(item).toHaveProperty("type");
      expect(item).toHaveProperty("tags");
      expect(item).toHaveProperty("projects");
      expect(item).toHaveProperty("pinned");
      expect(item).toHaveProperty("score");
      expect(item.createdAt).toBeTruthy();
      expect(item.updatedAt).toBeTruthy();
      expect(item.sourceHarness === null || typeof item.sourceHarness === "string").toBe(true);
    }

    // Results must be sorted descending by score
    for (let i = 0; i < parsed.length - 1; i++) {
      const curr = parsed[i];
      const next = parsed[i + 1];
      if (curr === undefined || next === undefined) break;
      expect(curr.score).toBeGreaterThanOrEqual(next.score);
    }
  });

  it("type filter restricts results to that memory type only", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await session.core.repo.save({ content: "use tabs for indentation", type: "preference" });
    await session.core.repo.save({
      content: "decided to use tabs for indentation style",
      type: "decision",
    });

    const result = await session.client.callTool({
      name: "query_memory",
      arguments: { query: "indentation style choice", type: "decision", global: true },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const parsed = JSON.parse((block as { type: string; text: string }).text) as Array<{
      type: string;
    }>;

    expect(parsed.length).toBeGreaterThan(0);
    for (const item of parsed) {
      expect(item.type).toBe("decision");
    }
  });

  it("global:true returns memories across all projects", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await session.core.repo.save({
      content: "project uses ESLint for linting",
      type: "fact",
      projectScope: { hash: "project-abc", name: "project-abc" },
    });
    await session.core.repo.save({
      content: "global linting preference is Biome",
      type: "fact",
    });

    const result = await session.client.callTool({
      name: "query_memory",
      arguments: { query: "linting tool configuration", global: true },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const parsed = JSON.parse((block as { type: string; text: string }).text) as Array<{
      content: string;
    }>;

    expect(parsed.length).toBe(2);
  });

  it("default scope returns only memories from the current project", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    // resolveProject() in tests resolves to the git remote or cwd hash — use a distinct hash for isolation
    await session.core.repo.save({
      content: "project-x uses webpack for bundling",
      type: "fact",
      projectScope: { hash: "project-x-hash", name: "project-x" },
    });
    await session.core.repo.save({
      content: "project-y uses vite for bundling",
      type: "fact",
      projectScope: { hash: "project-y-hash", name: "project-y" },
    });

    // Default query resolves to the test process's project (not project-x or project-y)
    const result = await session.client.callTool({
      name: "query_memory",
      arguments: { query: "bundler configuration" },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const parsed = JSON.parse((block as { type: string; text: string }).text) as Array<{
      content: string;
    }>;

    // Neither project-x nor project-y memories should appear for the test project scope
    expect(parsed.some((r) => r.content.includes("project-x"))).toBe(false);
    expect(parsed.some((r) => r.content.includes("project-y"))).toBe(false);
  });

  it("default scope finds memories saved to the current project", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    // Save directly via MCP tool (default scope = current project from resolveProject())
    const saveResult = await session.client.callTool({
      name: "save_memory",
      arguments: { content: "use pnpm for package management in this project", type: "fact" },
    });

    if ("toolResult" in saveResult) throw new Error("unreachable");
    const [saveBlock] = saveResult.content;
    const saved = JSON.parse((saveBlock as { type: string; text: string }).text) as {
      id: string;
    };

    const queryResult = await session.client.callTool({
      name: "query_memory",
      arguments: { query: "package manager choice" },
    });

    if ("toolResult" in queryResult) throw new Error("unreachable");
    const [queryBlock] = queryResult.content;
    const parsed = JSON.parse((queryBlock as { type: string; text: string }).text) as Array<{
      id: string;
    }>;

    expect(parsed.some((r) => r.id === saved.id)).toBe(true);
  });

  it("limit caps the number of results returned", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    // Save 5 memories, then request limit 2
    for (let i = 0; i < 5; i++) {
      await session.core.repo.save({
        content: `learning about javascript async pattern number ${i}`,
        type: "learning",
      });
    }

    const result = await session.client.callTool({
      name: "query_memory",
      arguments: { query: "javascript async patterns", limit: 2 },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const parsed = JSON.parse((block as { type: string; text: string }).text) as unknown[];

    expect(parsed.length).toBeLessThanOrEqual(2);
  });

  it("default limit of 10 is applied when limit is not provided", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    for (let i = 0; i < 12; i++) {
      await session.core.repo.save({
        content: `fact about node.js runtime behaviour number ${i}`,
        type: "fact",
      });
    }

    const result = await session.client.callTool({
      name: "query_memory",
      arguments: { query: "node.js runtime" },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const parsed = JSON.parse((block as { type: string; text: string }).text) as unknown[];

    expect(parsed.length).toBeLessThanOrEqual(10);
  });

  it("missing query argument returns a structured MCP error", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await expect(
      session.client.callTool({ name: "query_memory", arguments: {} })
    ).rejects.toThrow();
  });

  it("pinned memories are excluded from results by default", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const saved = await session.core.repo.save({
      content: "always use strict TypeScript",
      type: "preference",
    });
    session.core.repo.setPin(saved.id, true);

    const result = await session.client.callTool({
      name: "query_memory",
      arguments: { query: "TypeScript strict mode", global: true },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const parsed = JSON.parse((block as { type: string; text: string }).text) as Array<{
      id: string;
      pinned: boolean;
    }>;

    expect(parsed.every((r) => !r.pinned)).toBe(true);
    expect(parsed.some((r) => r.id === saved.id)).toBe(false);
  });

  it("includePinned=true returns pinned memories", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const saved = await session.core.repo.save({
      content: "always use strict TypeScript",
      type: "preference",
    });
    session.core.repo.setPin(saved.id, true);

    const result = await session.client.callTool({
      name: "query_memory",
      arguments: { query: "TypeScript strict mode", includePinned: true, global: true },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const parsed = JSON.parse((block as { type: string; text: string }).text) as Array<{
      id: string;
      pinned: boolean;
    }>;

    expect(parsed.some((r) => r.id === saved.id)).toBe(true);
  });
});
