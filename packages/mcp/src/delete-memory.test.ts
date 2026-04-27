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

type TextBlock = { type: string; text: string };

function parseText<T>(result: { content: unknown }): T {
  const [block] = result.content as TextBlock[];
  return JSON.parse(block.text) as T;
}

describe("delete_memory tool", () => {
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
    expect(names).toContain("delete_memory");
  });

  it("deletes a memory and returns success confirmation", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const saved = await session.core.repo.save({
      content: "temporary preference",
      type: "preference",
      scope: "global",
    });

    const result = await session.client.callTool({
      name: "delete_memory",
      arguments: { id: saved.id },
    });

    const body = parseText<{ success: boolean; id: string }>(result);
    expect(body.success).toBe(true);
    expect(body.id).toBe(saved.id);
  });

  it("unknown id returns a ToolError with descriptive message", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const result = await session.client.callTool({
      name: "delete_memory",
      arguments: { id: "does-not-exist" },
    });

    expect(result.isError).toBe(true);
    const [block] = result.content as TextBlock[];
    expect(block.text).toMatch(/does-not-exist/);
  });

  it("missing id returns a structured MCP error", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await expect(
      session.client.callTool({ name: "delete_memory", arguments: {} })
    ).rejects.toThrow();
  });
});
