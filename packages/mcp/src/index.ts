import {
  runExtraction as coreExtraction,
  runSynthesis as coreSynthesis,
  createCapabilityRepository,
  createClaudeCodeTranscriptReader,
  createExtractionAgentRunner,
  createExtractionRunRepository,
  createMemoryRepository,
  createProjectRepository,
  createQueryEngine,
  createSynthesisAgentRunner,
  createSynthesisRepository,
  DatabaseManager,
  EmbeddingService,
  GLOBAL_SCOPE_HASH,
  isSynthesisEnabled,
  type RunExtractionInput,
  type RunExtractionResult,
  resolveProject,
} from "@membank/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CoreServices } from "./server.js";
import { buildExtractionTools, createServer, initCore } from "./server.js";

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
  const projects = createProjectRepository(db);
  const synthRepo = createSynthesisRepository(db);
  const agentRunner = createSynthesisAgentRunner();

  let resolvedScope = scope;
  if (scope === "global") {
    resolvedScope = GLOBAL_SCOPE_HASH;
  } else if (!/^[0-9a-f]{16}$/.test(scope)) {
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

export interface RunExtractionOptions {
  sessionId: string;
  transcriptPath: string;
  projectHash?: string;
}

export async function runExtraction(opts: RunExtractionOptions): Promise<RunExtractionResult> {
  const db = DatabaseManager.open();
  try {
    const embedding = new EmbeddingService();
    const projects = createProjectRepository(db);
    const repo = createMemoryRepository(db, projects);
    const capabilities = createCapabilityRepository(db, projects);
    const queryEngine = createQueryEngine(db, embedding);
    const runRepo = createExtractionRunRepository(db);
    const tools = buildExtractionTools(repo, queryEngine, embedding, capabilities);
    const agent = createExtractionAgentRunner(tools);
    const transcripts = createClaudeCodeTranscriptReader();

    const projectHash = opts.projectHash ?? (await resolveProject()).hash;

    const input: RunExtractionInput = {
      sessionId: opts.sessionId,
      transcriptPath: opts.transcriptPath,
      projectHash,
    };

    return await coreExtraction(input, {
      repo: runRepo,
      transcripts,
      agent,
      config: {},
    });
  } finally {
    db.close();
  }
}
