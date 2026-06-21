import { saveMemory } from "@membank/core";
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

function parseText<T>(result: CallResult): T {
  if ("toolResult" in result) throw new Error("unreachable");
  const content = result.content as Array<{ type: string; text?: string }>;
  const block = content[0];
  if (block?.type !== "text" || block.text === undefined) throw new Error("unreachable");
  return JSON.parse(block.text) as T;
}

type ProjectListEntry = {
  id: string;
  name: string;
  origin: string | null;
  scopeHash: string;
  memoryCount: number;
};

async function seedProject(core: CoreServices, hash: string, name: string): Promise<string> {
  await saveMemory(
    {
      content: `memory for ${name}`,
      type: "fact",
      target: { tag: "project", scope: { hash, name } },
    },
    { repo: core.repo, embedder: core.embedding }
  );
  const project = core.projects.getByHash(hash);
  if (project === undefined) throw new Error("seed failed");
  return project.id;
}

const HASH_A = "aaaaaaaaaaaaaaaa";
const HASH_B = "bbbbbbbbbbbbbbbb";

describe("list_projects tool", () => {
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

    const { tools } = await session.client.listTools();
    expect(tools.map((t) => t.name)).toContain("list_projects");
  });

  it("returns projects enriched with memory count and origin", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;
    await seedProject(session.core, HASH_A, "alpha");

    const result = await session.client.callTool({ name: "list_projects", arguments: {} });
    const projects = parseText<ProjectListEntry[]>(result);

    const alpha = projects.find((p) => p.scopeHash === HASH_A);
    expect(alpha).toBeDefined();
    expect(alpha?.memoryCount).toBe(1);
    expect(alpha).toHaveProperty("origin");
  });
});

describe("reconcile_project tool", () => {
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

    const { tools } = await session.client.listTools();
    expect(tools.map((t) => t.name)).toContain("reconcile_project");
  });

  it("merges the source project into the target when both ids are given", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;
    const sourceId = await seedProject(session.core, HASH_A, "orphan");
    const targetId = await seedProject(session.core, HASH_B, "parent");

    const result = await session.client.callTool({
      name: "reconcile_project",
      arguments: { sourceId, targetId },
    });
    const body = parseText<{ movedMemories: number; target: { name: string } }>(result);

    expect(body.movedMemories).toBe(1);
    expect(body.target.name).toBe("parent");
    expect(session.core.projects.getById(sourceId)).toBeUndefined();
  });

  it("rejects when only one id is provided", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;
    const sourceId = await seedProject(session.core, HASH_A, "orphan");

    const result = await session.client.callTool({
      name: "reconcile_project",
      arguments: { sourceId },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text?: string }>;
    expect(content[0]?.text).toMatch(/both sourceId and targetId/);
  });

  it("reports when no orphan is found for auto-detect with no ids", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const result = await session.client.callTool({
      name: "reconcile_project",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ text?: string }>;
    expect(content[0]?.text).toMatch(/No orphaned project found/);
  });
});
