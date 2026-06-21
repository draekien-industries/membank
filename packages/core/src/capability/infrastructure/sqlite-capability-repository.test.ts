import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../../db/manager.js";
import { SqliteMemoryRepository } from "../../memory/infrastructure/sqlite-memory-repository.js";
import { SqliteProjectRepository } from "../../project/infrastructure/sqlite-project-repository.js";
import { CapabilityKey } from "../domain/capability-key.js";
import { SqliteCapabilityRepository } from "./sqlite-capability-repository.js";

const runIntegration = process.env.MEMBANK_INTEGRATION === "true";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../test-fixtures");

function makeEmbedding(dimension: number): Float32Array {
  const arr = new Float32Array(384).fill(0);
  arr[dimension] = 1;
  return arr;
}

describe.skipIf(!runIntegration)("SqliteCapabilityRepository — integration (file-based DB)", () => {
  let dbPath: string;
  let db: DatabaseManager;
  let projects: SqliteProjectRepository;
  let memories: SqliteMemoryRepository;
  let capabilities: SqliteCapabilityRepository;

  beforeEach(() => {
    mkdirSync(fixturesDir, { recursive: true });
    dbPath = join(fixturesDir, `${randomUUID()}.db`);
    db = DatabaseManager.open(dbPath);
    projects = new SqliteProjectRepository(db);
    memories = new SqliteMemoryRepository(db, projects);
    capabilities = new SqliteCapabilityRepository(db, projects);
  });

  afterEach(() => {
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(dbPath + suffix, { force: true });
    }
  });

  function createUnassociatedMemory(content: string): string {
    const id = randomUUID();
    memories.create({
      id,
      content,
      type: "fact",
      tags: [],
      sourceHarness: null,
      embedding: makeEmbedding(0),
    });
    return id;
  }

  it("upsertByKey is idempotent on key", () => {
    const key = CapabilityKey.forTool("Bash");
    const first = capabilities.upsertByKey(key);
    const second = capabilities.upsertByKey(key);

    expect(first.id).toBe(second.id);
    expect(first.kind).toBe("tool");
    expect(first.key).toBe("tool:Bash");
    expect(capabilities.findByKey(key)?.id).toBe(first.id);
  });

  it("findByKey returns null for an unknown key", () => {
    expect(capabilities.findByKey(CapabilityKey.forSkill("missing"))).toBeNull();
  });

  it("associates memories and returns them most-recent-first, unranked", () => {
    const key = CapabilityKey.forTool("Bash");
    const capability = capabilities.upsertByKey(key);

    const older = createUnassociatedMemory("older");
    const newer = createUnassociatedMemory("newer");
    capabilities.associate(older, capability.id);
    capabilities.associate(newer, capability.id);

    const result = capabilities.allMemoriesForCapability(key);
    expect(result.map((m) => m.id)).toEqual([newer, older]);
    expect(result[0]?.projects).toHaveLength(0);
  });

  it("caps allMemoriesForCapability at 25 most-recent", () => {
    const key = CapabilityKey.forSkill("simplify");
    const capability = capabilities.upsertByKey(key);
    for (let i = 0; i < 30; i++) {
      capabilities.associate(createUnassociatedMemory(`m${i}`), capability.id);
    }
    expect(capabilities.allMemoriesForCapability(key)).toHaveLength(25);
  });

  it("listByKind reports memory counts and filters by kind", () => {
    const toolKey = CapabilityKey.forTool("Bash");
    const skillKey = CapabilityKey.forSkill("simplify");
    const tool = capabilities.upsertByKey(toolKey);
    capabilities.upsertByKey(skillKey);
    capabilities.associate(createUnassociatedMemory("m"), tool.id);

    const tools = capabilities.listByKind("tool");
    expect(tools).toHaveLength(1);
    expect(tools[0]?.key).toBe("tool:Bash");
    expect(tools[0]?.memoryCount).toBe(1);

    const skills = capabilities.listByKind("skill");
    expect(skills).toHaveLength(1);
    expect(skills[0]?.memoryCount).toBe(0);
  });
});
