import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../schemas.js";
import type { ProjectRepository } from "../ports.js";

function project(hash: string, name: string): Project {
  return {
    id: `id-${hash}`,
    name,
    scopeHash: hash,
    origin: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeFakeRepo(byHash: Map<string, Project>): ProjectRepository {
  return {
    upsertByHash: vi.fn(),
    rename: vi.fn(),
    list: () => [...byHash.values()],
    getById: vi.fn(),
    getByHash: (hash) => byHash.get(hash),
    getByName: vi.fn(),
    addAssociation: vi.fn(),
    removeAssociation: vi.fn(),
    countMemories: vi.fn(() => 0),
    getProjectsForMemories: vi.fn(() => new Map()),
    merge: vi.fn(() => ({ movedMemories: 0 })),
    listExclusiveMemoryIds: vi.fn(() => []),
    deleteById: vi.fn(),
  };
}

function mockScope(
  legacy: { hash: string } | null,
  target: { hash: string; name: string; origin: string }
): void {
  vi.doMock("../../scope/index.js", () => ({
    resolveLegacyCwdScope: vi.fn().mockResolvedValue(legacy),
    resolveProject: vi.fn().mockResolvedValue(target),
  }));
}

describe("findWorktreeOrphan", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the orphan and target when a legacy project exists under the cwd hash", async () => {
    mockScope(
      { hash: "legacy-hash" },
      { hash: "parent-hash", name: "parent", origin: "/repos/main" }
    );
    const { findWorktreeOrphan } = await import("./find-worktree-orphan.js");
    const orphan = project("legacy-hash", "orphan");

    const result = await findWorktreeOrphan(makeFakeRepo(new Map([["legacy-hash", orphan]])));

    expect(result).toEqual({
      orphan,
      target: { hash: "parent-hash", name: "parent", origin: "/repos/main" },
    });
  });

  it("returns null when not inside a linked worktree", async () => {
    mockScope(null, { hash: "parent-hash", name: "parent", origin: "/repos/main" });
    const { findWorktreeOrphan } = await import("./find-worktree-orphan.js");

    expect(await findWorktreeOrphan(makeFakeRepo(new Map()))).toBeNull();
  });

  it("returns null when the legacy hash already equals the resolved target", async () => {
    mockScope(
      { hash: "parent-hash" },
      { hash: "parent-hash", name: "parent", origin: "/repos/main" }
    );
    const { findWorktreeOrphan } = await import("./find-worktree-orphan.js");

    expect(await findWorktreeOrphan(makeFakeRepo(new Map()))).toBeNull();
  });

  it("returns null when no project exists under the legacy hash", async () => {
    mockScope(
      { hash: "legacy-hash" },
      { hash: "parent-hash", name: "parent", origin: "/repos/main" }
    );
    const { findWorktreeOrphan } = await import("./find-worktree-orphan.js");

    expect(await findWorktreeOrphan(makeFakeRepo(new Map()))).toBeNull();
  });
});
