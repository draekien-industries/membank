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

describe("get_memory_summary tool", () => {
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
    expect(names).toContain("get_memory_summary");
  });

  it("returns zeroed stats for empty store", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const result = await session.client.callTool({ name: "get_memory_summary", arguments: {} });
    expect(result.content).toHaveLength(1);
    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const summary = JSON.parse((block as { type: string; text: string }).text) as {
      total: number;
      byType: Record<string, number>;
      pinned: number;
      needsReview: number;
    };

    expect(summary.total).toBe(0);
    expect(summary.pinned).toBe(0);
    expect(summary.needsReview).toBe(0);
    expect(summary.byType).toMatchObject({
      correction: 0,
      preference: 0,
      decision: 0,
      learning: 0,
      fact: 0,
    });
  });

  it("counts total and byType correctly for mixed memories", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    await session.core.repo.save({ content: "prefer tabs", type: "preference" });
    await session.core.repo.save({ content: "use pnpm", type: "decision" });
    await session.core.repo.save({ content: "node is fast", type: "fact" });

    const result = await session.client.callTool({ name: "get_memory_summary", arguments: {} });
    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const summary = JSON.parse((block as { type: string; text: string }).text) as {
      total: number;
      byType: Record<string, number>;
      pinned: number;
      needsReview: number;
    };

    expect(summary.total).toBe(3);
    expect(summary.byType.preference).toBe(1);
    expect(summary.byType.decision).toBe(1);
    expect(summary.byType.fact).toBe(1);
    expect(summary.byType.correction).toBe(0);
    expect(summary.byType.learning).toBe(0);
  });

  it("counts pinned memories correctly", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const m1 = await session.core.repo.save({ content: "prefer tabs", type: "preference" });
    await session.core.repo.save({ content: "use pnpm", type: "decision" });
    session.core.repo.setPin(m1.id, true);

    const result = await session.client.callTool({ name: "get_memory_summary", arguments: {} });
    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const summary = JSON.parse((block as { type: string; text: string }).text) as {
      total: number;
      pinned: number;
    };

    expect(summary.total).toBe(2);
    expect(summary.pinned).toBe(1);
  });

  it("counts needsReview when flagged memories exist", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const m1 = await session.core.repo.save({
      content: "always use dark mode",
      type: "preference",
    });
    const m2 = await session.core.repo.save({
      content: "always use light mode",
      type: "preference",
    });

    // Insert directly: real similarity dedup is non-deterministic in unit tests.
    session.core.db.db
      .prepare(
        `INSERT INTO memory_review_events
           (id, memory_id, conflicting_memory_id, similarity, conflict_content_snapshot, reason, created_at)
         VALUES (?, ?, ?, ?, ?, 'similarity_dedup', ?)`
      )
      .run("test-event-id", m1.id, m2.id, 0.8, m2.content, new Date().toISOString());

    const result = await session.client.callTool({ name: "get_memory_summary", arguments: {} });
    if ("toolResult" in result) throw new Error("unreachable");
    const [block] = result.content;
    const summary = JSON.parse((block as { type: string; text: string }).text) as {
      needsReview: number;
    };

    expect(summary.needsReview).toBe(1);
  });
});
