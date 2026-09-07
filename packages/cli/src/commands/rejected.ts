import {
  createMemoryRepository,
  createProjectRepository,
  createRejectedCandidateRepository,
  DatabaseManager,
  EmbeddingService,
  GLOBAL_SCOPE_HASH,
  loadThresholds,
  promoteRejectedCandidate,
  saveMemory,
} from "@membank/core";
import type { Formatter } from "../formatter.js";
import { LimitSchema, MemoryTypeSchema, RejectionClauseSchema } from "../schemas.js";

interface RejectedCommandOptions {
  clause?: string;
  limit?: string;
  promote?: string;
}

const PROMOTION_HARNESS = "membank-promotion";

export async function rejectedCommand(
  options: RejectedCommandOptions,
  formatter: Formatter
): Promise<void> {
  const db = DatabaseManager.open();
  try {
    const rejections = createRejectedCandidateRepository(db);

    if (options.promote !== undefined) {
      const projects = createProjectRepository(db);
      const repo = createMemoryRepository(db, projects);
      const embedder = new EmbeddingService();

      const result = await promoteRejectedCandidate(options.promote, {
        rejections,
        memories: {
          save: async (args): Promise<{ id: string }> => {
            const project =
              args.projectHash === null || args.projectHash === GLOBAL_SCOPE_HASH
                ? undefined
                : projects.getByHash(args.projectHash);
            const memory = await saveMemory(
              {
                content: args.content,
                type: MemoryTypeSchema.parse(args.type),
                target:
                  project === undefined
                    ? { tag: "global" }
                    : { tag: "project", scope: { hash: project.scopeHash, name: project.name } },
                sourceHarness: PROMOTION_HARNESS,
                durability: args.durability,
              },
              { repo, embedder, thresholds: loadThresholds() }
            );
            return { id: memory.id };
          },
        },
      });

      formatter.outputPromotion(result, options.promote);
      return;
    }

    const candidates = rejections.list({
      ...(options.clause !== undefined && { clause: RejectionClauseSchema.parse(options.clause) }),
      ...(options.limit !== undefined && { limit: LimitSchema.parse(options.limit) }),
    });
    formatter.outputRejected(candidates);
  } finally {
    db.close();
  }
}
