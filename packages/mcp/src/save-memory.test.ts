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

describe("save_memory tool", () => {
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
    expect(names).toContain("save_memory");
  });

  it("creates a new memory and returns full record with id and timestamps", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const result = await session.client.callTool({
      name: "save_memory",
      arguments: { content: "prefer spaces over tabs", type: "preference" },
    });

    expect(result.content).toHaveLength(1);
    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    expect(block).toMatchObject({ type: "text" });

    const memory = JSON.parse((block as { type: string; text: string }).text) as {
      id: string;
      content: string;
      type: string;
      tags: string[];
      scope: string;
      pinned: boolean;
      needsReview: boolean;
      createdAt: string;
      updatedAt: string;
    };

    expect(memory.id).toBeTruthy();
    expect(memory.content).toBe("prefer spaces over tabs");
    expect(memory.type).toBe("preference");
    expect(memory.tags).toEqual([]);
    expect(typeof memory.scope).toBe("string");
    expect(memory.createdAt).toBeTruthy();
    expect(memory.updatedAt).toBeTruthy();
  });

  it("scope defaults to resolved project scope when not provided", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const result = await session.client.callTool({
      name: "save_memory",
      arguments: { content: "always use strict mode", type: "preference" },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const memory = JSON.parse((block as { type: string; text: string }).text) as {
      scope: string;
    };

    // scope must be a non-empty string (resolved from git remote or cwd hash)
    expect(typeof memory.scope).toBe("string");
    expect(memory.scope.length).toBeGreaterThan(0);
  });

  it("accepts explicit scope and saves with that scope", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const result = await session.client.callTool({
      name: "save_memory",
      arguments: { content: "use biome for linting", type: "fact", scope: "my-project" },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const memory = JSON.parse((block as { type: string; text: string }).text) as {
      scope: string;
    };

    expect(memory.scope).toBe("my-project");
  });

  it("saves tags when provided", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const result = await session.client.callTool({
      name: "save_memory",
      arguments: {
        content: "use vitest for unit tests",
        type: "decision",
        tags: ["testing", "tooling"],
      },
    });

    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const memory = JSON.parse((block as { type: string; text: string }).text) as {
      tags: string[];
    };

    expect(memory.tags).toEqual(["testing", "tooling"]);
  });

  it("dedup overwrite: saving near-identical memory returns updated record not a duplicate", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    // Save original
    const first = await session.client.callTool({
      name: "save_memory",
      arguments: {
        content: "prefer dark mode in VS Code editor",
        type: "preference",
        scope: "global",
      },
    });

    if ("toolResult" in first) throw new Error("unreachable");
    const [firstBlock] = first.content;
    const firstMemory = JSON.parse((firstBlock as { type: string; text: string }).text) as {
      id: string;
    };

    // Save near-identical content — should overwrite, not create a new record
    const second = await session.client.callTool({
      name: "save_memory",
      arguments: {
        content: "prefer dark mode in VS Code editor always",
        type: "preference",
        scope: "global",
      },
    });

    if ("toolResult" in second) throw new Error("unreachable");
    const [secondBlock] = second.content;
    const secondMemory = JSON.parse((secondBlock as { type: string; text: string }).text) as {
      id: string;
      content: string;
    };

    // Same id means the existing record was overwritten
    expect(secondMemory.id).toBe(firstMemory.id);
    expect(secondMemory.content).toBe("prefer dark mode in VS Code editor always");
  });

  it("dedup overwrite: only one record exists in the DB after saving near-identical memories", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await session.core.repo.save({
      content: "always use TypeScript strict mode for all projects",
      type: "preference",
      scope: "global",
    });

    await session.client.callTool({
      name: "save_memory",
      arguments: {
        content: "always use TypeScript strict mode for all projects enabled",
        type: "preference",
        scope: "global",
      },
    });

    // Query to confirm only one record exists for this content
    const results = await session.core.query.query({
      query: "TypeScript strict mode",
      type: "preference",
      scope: "global",
      limit: 10,
    });

    expect(results.length).toBe(1);
  });

  it("missing content returns a structured MCP error", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await expect(
      session.client.callTool({ name: "save_memory", arguments: { type: "preference" } })
    ).rejects.toThrow();
  });

  it("missing type returns a structured MCP error", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await expect(
      session.client.callTool({
        name: "save_memory",
        arguments: { content: "some content" },
      })
    ).rejects.toThrow();
  });

  it("invalid type value returns a structured MCP error", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await expect(
      session.client.callTool({
        name: "save_memory",
        arguments: { content: "some content", type: "invalid_type" },
      })
    ).rejects.toThrow();
  });
});
