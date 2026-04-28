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
      arguments: { query: "editor theme settings" },
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
      scope: string;
      pinned: boolean;
      score: number;
    }>;

    expect(parsed.length).toBeGreaterThan(0);
    for (const item of parsed) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("content");
      expect(item).toHaveProperty("type");
      expect(item).toHaveProperty("tags");
      expect(item).toHaveProperty("scope");
      expect(item).toHaveProperty("pinned");
      expect(item).toHaveProperty("score");
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
      arguments: { query: "indentation style choice", type: "decision" },
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

  it("scope filter restricts results to that scope only", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await session.core.repo.save({
      content: "project uses ESLint for linting",
      type: "fact",
      scope: "project-abc",
    });
    await session.core.repo.save({
      content: "global linting preference is Biome",
      type: "fact",
      scope: "global",
    });

    const result = await session.client.callTool({
      name: "query_memory",
      arguments: { query: "linting tool configuration", scope: "project-abc" },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const parsed = JSON.parse((block as { type: string; text: string }).text) as Array<{
      scope: string;
    }>;

    expect(parsed.length).toBeGreaterThan(0);
    for (const item of parsed) {
      expect(item.scope).toBe("project-abc");
    }
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
});
