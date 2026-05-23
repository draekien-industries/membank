import type { ProjectRepository } from "@membank/core";
import { saveMemory } from "@membank/core";
import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("error hardening", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (cleanup !== undefined) {
      await cleanup();
      cleanup = undefined;
    }
  });

  describe("save_memory core error propagation", () => {
    it("returns ToolError when embedding throws during save", async () => {
      const session = await startInProcess();
      cleanup = session.cleanup;

      vi.spyOn(session.core.embedding, "embed").mockRejectedValue(new Error("DB locked"));

      const result = await session.client.callTool({
        name: "save_memory",
        arguments: { content: "some preference", type: "preference" },
      });

      expect(result.isError).toBe(true);
      const [block] = result.content as TextBlock[];
      expect(block?.text).toMatch(/DB locked/);
    });

    it("server stays responsive after save_memory core error", async () => {
      const session = await startInProcess();
      cleanup = session.cleanup;

      vi.spyOn(session.core.embedding, "embed").mockRejectedValueOnce(new Error("DB locked"));

      await session.client.callTool({
        name: "save_memory",
        arguments: { content: "some preference", type: "preference" },
      });

      // Restore mocks so the next call uses the real implementation
      vi.restoreAllMocks();

      const result = await session.client.callTool({
        name: "list_migrations",
        arguments: {},
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe("update_memory core error propagation", () => {
    it("returns ToolError when core.repo.update throws", async () => {
      const session = await startInProcess();
      cleanup = session.cleanup;

      vi.spyOn(session.core.repo, "update").mockImplementation(() => {
        throw new Error("DB locked");
      });

      const result = await session.client.callTool({
        name: "update_memory",
        arguments: { id: "any-id", content: "new content" },
      });

      expect(result.isError).toBe(true);
      const [block] = result.content as TextBlock[];
      expect(block?.text).toMatch(/DB locked/);
    });

    it("server stays responsive after update_memory core error", async () => {
      const session = await startInProcess();
      cleanup = session.cleanup;

      vi.spyOn(session.core.repo, "update").mockImplementationOnce(() => {
        throw new Error("DB locked");
      });

      await session.client.callTool({
        name: "update_memory",
        arguments: { id: "any-id", content: "new content" },
      });

      vi.restoreAllMocks();

      const result = await session.client.callTool({
        name: "list_migrations",
        arguments: {},
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe("delete_memory core error propagation", () => {
    it("returns ToolError when core.repo.delete throws", async () => {
      const session = await startInProcess();
      cleanup = session.cleanup;

      const saved = await saveMemory(
        { content: "to be deleted", type: "fact" },
        { repo: session.core.repo, embedder: session.core.embedding }
      );

      vi.spyOn(session.core.repo, "delete").mockImplementation(() => {
        throw new Error("DB locked");
      });

      const result = await session.client.callTool({
        name: "delete_memory",
        arguments: { id: saved.id },
      });

      expect(result.isError).toBe(true);
      const [block] = result.content as TextBlock[];
      expect(block?.text).toMatch(/DB locked/);
    });

    it("server stays responsive after delete_memory core error", async () => {
      const session = await startInProcess();
      cleanup = session.cleanup;

      const saved = await saveMemory(
        { content: "to be deleted", type: "fact" },
        { repo: session.core.repo, embedder: session.core.embedding }
      );

      vi.spyOn(session.core.repo, "delete").mockImplementationOnce(() => {
        throw new Error("DB locked");
      });

      await session.client.callTool({
        name: "delete_memory",
        arguments: { id: saved.id },
      });

      vi.restoreAllMocks();

      const result = await session.client.callTool({
        name: "list_migrations",
        arguments: {},
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe("query_memory core error propagation", () => {
    it("returns ToolError when core.query.query throws", async () => {
      const session = await startInProcess();
      cleanup = session.cleanup;

      vi.spyOn(session.core.query, "query").mockRejectedValue(new Error("DB locked"));

      const result = await session.client.callTool({
        name: "query_memory",
        arguments: { query: "some search text" },
      });

      expect(result.isError).toBe(true);
      const [block] = result.content as TextBlock[];
      expect(block?.text).toMatch(/DB locked/);
    });

    it("server stays responsive after query_memory core error", async () => {
      const session = await startInProcess();
      cleanup = session.cleanup;

      vi.spyOn(session.core.query, "query").mockRejectedValueOnce(new Error("DB locked"));

      await session.client.callTool({
        name: "query_memory",
        arguments: { query: "some search text" },
      });

      vi.restoreAllMocks();

      const result = await session.client.callTool({
        name: "list_migrations",
        arguments: {},
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe("bad DB state stub", () => {
    it("all tool methods return ToolError when core stub throws on every call", async () => {
      const dbError = new Error("database disk image is malformed");

      // Build a stub CoreServices where every method rejects
      const stubCore: CoreServices = {
        db: {
          db: {
            prepare: () => {
              throw dbError;
            },
          },
          close: () => {},
        } as unknown as CoreServices["db"],
        embedding: { embed: () => Promise.reject(dbError) } as unknown as CoreServices["embedding"],
        repo: {
          create: () => {
            throw dbError;
          },
          overwrite: () => {
            throw dbError;
          },
          update: () => {
            throw dbError;
          },
          delete: () => {
            throw dbError;
          },
          findById: () => undefined,
          findSimilar: () => [],
          list: () => [],
          listFlagged: () => [],
          listReviewEvents: () => [],
          getPinnedCharCount: () => 0,
          stats: () => {
            throw dbError;
          },
          createReviewEvent: () => {},
          resolveReviewEvents: () => {},
          setPin: () => {
            throw dbError;
          },
          incrementAccessCount: () => {},
          incrementAccessCountBy: () => {},
          atomicMerge: () => {
            throw dbError;
          },
        } as unknown as CoreServices["repo"],
        query: {
          query: () => Promise.reject(dbError),
        } as unknown as CoreServices["query"],
        projects: {
          upsertByHash: vi.fn().mockReturnValue({
            id: "p1",
            name: "test",
            scopeHash: "abc",
            createdAt: "",
            updatedAt: "",
          }),
          rename: vi.fn(),
          list: vi.fn().mockReturnValue([]),
          getByHash: vi.fn().mockReturnValue(undefined),
          addAssociation: vi.fn(),
          removeAssociation: vi.fn(),
          getProjectsForMemories: vi.fn().mockReturnValue(new Map()),
        } as unknown as ProjectRepository,
        activityLogger: { logEvent: vi.fn() },
        synthRepo: {
          saveSynthesis: () => {
            throw dbError;
          },
          getSynthesis: () => {
            throw dbError;
          },
          listAll: () => {
            throw dbError;
          },
          listVersions: () => {
            throw dbError;
          },
          getVersion: () => {
            throw dbError;
          },
          markInFlight: () => {},
          clearInFlight: () => {},
          clearStaleInFlight: () => {},
          sourceMemoryHash: () => {
            throw dbError;
          },
          getExpiredOrDirtyScopes: () => {
            throw dbError;
          },
          getAllActiveScopes: () => {
            throw dbError;
          },
          expireStale: () => {},
          initializeAndGetDirtyScopes: () => {
            throw dbError;
          },
        },
      };

      const server = createServer(stubCore);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      const client = new Client({ name: "test-client", version: "0.0.1" }, { capabilities: {} });
      await client.connect(clientTransport);

      const stubCleanup = async () => {
        await client.close();
        await server.close();
      };

      try {
        const saveResult = await client.callTool({
          name: "save_memory",
          arguments: { content: "content", type: "fact" },
        });
        expect(saveResult.isError).toBe(true);
        const [saveBlock] = saveResult.content as TextBlock[];
        expect(saveBlock?.text).toMatch(/malformed/);

        const queryResult = await client.callTool({
          name: "query_memory",
          arguments: { query: "something" },
        });
        expect(queryResult.isError).toBe(true);

        const updateResult = await client.callTool({
          name: "update_memory",
          arguments: { id: "any-id", content: "new content" },
        });
        expect(updateResult.isError).toBe(true);

        // delete_memory: the prepare() stub throws, which is inside the try/catch
        const deleteResult = await client.callTool({
          name: "delete_memory",
          arguments: { id: "any-id" },
        });
        expect(deleteResult.isError).toBe(true);
      } finally {
        await stubCleanup();
      }
    });
  });
});
