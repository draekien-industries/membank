import { PIN_BUDGET_THRESHOLD } from "@membank/core";
import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoreServices } from "./server.js";
import { createServer, initCore } from "./server.js";

vi.mock("@membank/core", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@membank/core")>();
  return { ...mod, isSynthesisEnabled: vi.fn().mockReturnValue(false) };
});

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

function parseText(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  if ("toolResult" in result) throw new Error("unreachable");
  const [block] = result.content;
  return JSON.parse((block as { type: string; text: string }).text);
}

describe("pin_memory tool — pin budget warning", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (cleanup !== undefined) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it("returns no pinBudgetWarning when pinned char count is under threshold", async () => {
    const { isSynthesisEnabled } = await import("@membank/core");
    vi.mocked(isSynthesisEnabled).mockReturnValue(false);

    const session = await startInProcess();
    cleanup = session.cleanup;

    const memory = await session.core.repo.save({ content: "short content", type: "fact" });

    const result = await session.client.callTool({
      name: "pin_memory",
      arguments: { id: memory.id },
    });

    const parsed = parseText(result) as { pinBudgetWarning?: string };
    expect(parsed.pinBudgetWarning).toBeUndefined();
  });

  it("returns pinBudgetWarning when pinned char count exceeds threshold and synthesis is disabled", async () => {
    const { isSynthesisEnabled } = await import("@membank/core");
    vi.mocked(isSynthesisEnabled).mockReturnValue(false);

    const session = await startInProcess();
    cleanup = session.cleanup;

    const longContent = "x".repeat(PIN_BUDGET_THRESHOLD + 1);
    const memory = await session.core.repo.save({ content: longContent, type: "fact" });

    const result = await session.client.callTool({
      name: "pin_memory",
      arguments: { id: memory.id },
    });

    const parsed = parseText(result) as { pinBudgetWarning?: string };
    expect(parsed.pinBudgetWarning).toBeDefined();
    expect(parsed.pinBudgetWarning).toContain(String(PIN_BUDGET_THRESHOLD));
  });

  it("returns no pinBudgetWarning when synthesis is enabled even if threshold exceeded", async () => {
    const { isSynthesisEnabled } = await import("@membank/core");
    vi.mocked(isSynthesisEnabled).mockReturnValue(true);

    const session = await startInProcess();
    cleanup = session.cleanup;

    const longContent = "x".repeat(PIN_BUDGET_THRESHOLD + 1);
    const memory = await session.core.repo.save({ content: longContent, type: "fact" });

    const result = await session.client.callTool({
      name: "pin_memory",
      arguments: { id: memory.id },
    });

    const parsed = parseText(result) as { pinBudgetWarning?: string };
    expect(parsed.pinBudgetWarning).toBeUndefined();
  });

  it("unpin_memory returns no pinBudgetWarning even when threshold exceeded", async () => {
    const { isSynthesisEnabled } = await import("@membank/core");
    vi.mocked(isSynthesisEnabled).mockReturnValue(false);

    const session = await startInProcess();
    cleanup = session.cleanup;

    const longContent = "x".repeat(PIN_BUDGET_THRESHOLD + 1);
    const memory = await session.core.repo.save({ content: longContent, type: "fact" });
    session.core.repo.setPin(memory.id, true);

    const result = await session.client.callTool({
      name: "unpin_memory",
      arguments: { id: memory.id },
    });

    const parsed = parseText(result) as { pinBudgetWarning?: string };
    expect(parsed.pinBudgetWarning).toBeUndefined();
  });
});
