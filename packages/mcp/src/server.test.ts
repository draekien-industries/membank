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

describe("MCP server bootstrap", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup !== undefined) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it("initialize handshake returns server name in server info", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const serverVersion = session.client.getServerVersion();
    expect(serverVersion).toBeDefined();
    expect(serverVersion?.name).toBe("membank");
  });

  it("initialize handshake returns a protocol version", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    const serverVersion = session.client.getServerVersion();
    expect(serverVersion).toBeDefined();
    expect(typeof serverVersion?.version).toBe("string");
    expect(serverVersion?.version.length).toBeGreaterThan(0);
  });

  it("core initialisation completes before accepting requests", async () => {
    const session = await startInProcess();
    cleanup = session.cleanup;

    // If core init hadn't completed, connect() would not have resolved.
    // The fact that we reach here means core was ready before the handshake.
    expect(session.core.db).toBeDefined();
    expect(session.core.embedding).toBeDefined();
    expect(session.core.repo).toBeDefined();
    expect(session.core.query).toBeDefined();
  });

  it("in-process transport pair is reusable across multiple connect/close cycles", async () => {
    for (let i = 0; i < 2; i++) {
      const session = await startInProcess();
      const serverVersion = session.client.getServerVersion();
      expect(serverVersion?.name).toBe("membank");
      await session.cleanup();
    }
  });

  it("fatal init error with bad db loader throws and does not hang", async () => {
    // Simulate a core init failure using the internal test hook on DatabaseManager.
    // The stdio entrypoint catches this error, writes to stderr, and calls process.exit.
    // Here we verify the DatabaseManager propagates the underlying error.
    const { DatabaseManager } = await import("@membank/core");
    expect(() => {
      DatabaseManager._openInMemoryWithLoader(() => {
        throw new Error("extension load failed");
      });
    }).toThrow("Failed to load sqlite-vec extension");
  });
});
