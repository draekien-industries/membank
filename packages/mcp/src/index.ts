import {
  createMemoryRepository,
  DatabaseManager,
  EmbeddingService,
  isSynthesisEnabled,
  ProjectRepository,
  QueryEngine,
  SynthesisRepository,
} from "@membank/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CoreServices } from "./server.js";
import { buildSynthesisTools, createServer, initCore } from "./server.js";
import { SynthesisAgentLoop } from "./synthesis/index.js";

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
  const projects = new ProjectRepository(db);
  const repo = createMemoryRepository(db, projects);
  const queryEngine = new QueryEngine(db, embedding, repo);
  const synthRepo = new SynthesisRepository(db);
  const agentLoop = new SynthesisAgentLoop(buildSynthesisTools(repo, queryEngine), {
    enabled: true,
  });

  let resolvedScope = scope;
  if (scope !== "global" && !/^[0-9a-f]{16}$/.test(scope)) {
    const project = projects.getByName(scope);
    if (project !== undefined) {
      resolvedScope = project.scopeHash;
    }
  }

  const projectHash = resolvedScope === "global" ? undefined : resolvedScope;

  synthRepo.markInFlight(resolvedScope);
  try {
    const [content, sourceHash] = await Promise.all([
      agentLoop.run(resolvedScope, projectHash),
      Promise.resolve(synthRepo.computeSourceMemoryHash(resolvedScope)),
    ]);
    synthRepo.saveSynthesis(resolvedScope, content, sourceHash);
    return content;
  } catch (err) {
    synthRepo.clearInFlight(resolvedScope);
    throw err;
  } finally {
    db.close();
  }
}
