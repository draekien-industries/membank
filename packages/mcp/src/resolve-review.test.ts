import { seedMemory, seedReviewEvent } from "@membank/core/test-support";
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

type CallResult = Awaited<ReturnType<Client["callTool"]>>;
type TextBlock = Extract<
  Extract<CallResult, { content: unknown }>["content"][number],
  { type: "text" }
>;

function parseText<T>(result: CallResult): T {
  if ("toolResult" in result) throw new Error("unreachable");
  const [block] = result.content;
  if (block?.type !== "text") throw new Error("unreachable");
  return JSON.parse(block.text) as T;
}

describe("resolve_review tool", () => {
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
    expect(names).toContain("resolve_review");
  });

  it("resolves unresolved review events and returns success", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    seedMemory(session.core.db, {
      id: "mem-1",
      content: "use tabs",
      type: "preference",
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    seedReviewEvent(session.core.db, {
      id: "evt-1",
      memoryId: "mem-1",
      similarity: 0.85,
      conflictContentSnapshot: "use spaces",
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const result = await session.client.callTool({
      name: "resolve_review",
      arguments: { id: "mem-1" },
    });

    const body = parseText<{ success: boolean; id: string }>(result);
    expect(body.success).toBe(true);
    expect(body.id).toBe("mem-1");

    const remaining = session.core.repo.listFlagged();
    expect(remaining).toHaveLength(0);
  });

  it("succeeds even when there are no unresolved events", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    seedMemory(session.core.db, {
      id: "mem-2",
      content: "use tabs",
      type: "preference",
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const result = await session.client.callTool({
      name: "resolve_review",
      arguments: { id: "mem-2" },
    });

    const body = parseText<{ success: boolean; id: string }>(result);
    expect(body.success).toBe(true);
  });

  it("unknown id returns a ToolError with descriptive message", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const result = await session.client.callTool({
      name: "resolve_review",
      arguments: { id: "does-not-exist" },
    });

    expect(result.isError).toBe(true);
    const [block] = result.content as TextBlock[];
    expect(block?.text).toMatch(/does-not-exist/);
  });

  it("missing id returns a structured MCP error", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await expect(
      session.client.callTool({ name: "resolve_review", arguments: {} })
    ).rejects.toThrow();
  });
});
