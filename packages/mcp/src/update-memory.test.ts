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

describe("update_memory tool", () => {
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
    expect(names).toContain("update_memory");
  });

  it("updates content and returns the updated record", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const saved = await session.core.repo.save({
      content: "use tabs for indentation",
      type: "preference",
      scope: "global",
    });

    const result = await session.client.callTool({
      name: "update_memory",
      arguments: { id: saved.id, content: "use spaces for indentation" },
    });

    const memory = parseText<{ id: string; content: string }>(result);
    expect(memory.id).toBe(saved.id);
    expect(memory.content).toBe("use spaces for indentation");
  });

  it("updates tags when provided", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const saved = await session.core.repo.save({
      content: "prefer functional components",
      type: "preference",
      scope: "global",
      tags: ["react"],
    });

    const result = await session.client.callTool({
      name: "update_memory",
      arguments: {
        id: saved.id,
        content: "prefer functional components",
        tags: ["react", "hooks"],
      },
    });

    const memory = parseText<{ tags: string[] }>(result);
    expect(memory.tags).toEqual(["react", "hooks"]);
  });

  it("unknown id returns a ToolError with descriptive message", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const result = await session.client.callTool({
      name: "update_memory",
      arguments: { id: "does-not-exist", content: "some content" },
    });

    expect(result.isError).toBe(true);
    const [block] = result.content as TextBlock[];
    expect(block!.text).toMatch(/does-not-exist/);
  });

  it("missing id returns a structured MCP error", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await expect(
      session.client.callTool({ name: "update_memory", arguments: { content: "some content" } })
    ).rejects.toThrow();
  });

  it("missing content returns a structured MCP error", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await expect(
      session.client.callTool({ name: "update_memory", arguments: { id: "some-id" } })
    ).rejects.toThrow();
  });
});
