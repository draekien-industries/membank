import {
  runSynthesis as coreSynthesis,
  createMemoryRepository,
  createProjectRepository,
  createSynthesisAgentRunner,
  createSynthesisRepository,
  DatabaseManager,
  EmbeddingService,
  isSynthesisEnabled,
  QueryEngine,
} from "@membank/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CoreServices } from "./server.js";
import { buildSynthesisTools, createServer, initCore } from "./server.js";

export async function startServer(): Promise<void> {
  let core: CoreServices;
  try {
    core = initCore();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`membank: failed to initialise core: ${message}\n`);
    process.exit(1);
  }

  if (core.synthEngine !== undefined) {
    try {
      await core.synthEngine.init();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`membank: synthesis engine init failed: ${message}\n`);
    }
  }

  const shutdown = async (): Promise<void> => {
    if (core.synthEngine !== undefined) {
      await core.synthEngine.shutdown();
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });

  const server = createServer(core);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function runSynthesis(scope: string): Promise<string> {
  if (!isSynthesisEnabled()) {
    throw new Error("Synthesis is not enabled. Run: membank config set synthesis.enabled true");
  }

  const db = DatabaseManager.open();
  const embedding = new EmbeddingService();
  const projects = createProjectRepository(db);
  const repo = createMemoryRepository(db, projects);
  const queryEngine = new QueryEngine(db, embedding, repo);
  const synthRepo = createSynthesisRepository(db);
  const agentRunner = createSynthesisAgentRunner(buildSynthesisTools(repo, queryEngine), {
    enabled: true,
  });

  let resolvedScope = scope;
  if (scope !== "global" && !/^[0-9a-f]{16}$/.test(scope)) {
    const project = projects.getByName(scope);
    if (project !== undefined) {
      resolvedScope = project.scopeHash;
    }
  }

  try {
    return await coreSynthesis(resolvedScope, { synthRepo, agentRunner });
  } finally {
    db.close();
  }
}
