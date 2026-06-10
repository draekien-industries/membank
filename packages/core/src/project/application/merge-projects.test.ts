import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../schemas.js";
import type { ProjectRepository } from "../ports.js";
import { mergeProjects } from "./merge-projects.js";

function project(id: string, name: string): Project {
  return {
    id,
    name,
    scopeHash: id,
    origin: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeFakeRepo(projects: Project[]): ProjectRepository {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return {
    upsertByHash: vi.fn(),
    rename: vi.fn(),
    list: () => [...byId.values()],
    getById: (id) => byId.get(id),
    getByHash: vi.fn(),
    getByName: vi.fn(),
    addAssociation: vi.fn(),
    removeAssociation: vi.fn(),
    countMemories: vi.fn(() => 0),
    getProjectsForMemories: vi.fn(() => new Map()),
    merge: vi.fn(() => ({ movedMemories: 3 })),
    listExclusiveMemoryIds: vi.fn(() => []),
    deleteById: vi.fn(),
  };
}

describe("mergeProjects", () => {
  it("delegates to repo.merge and returns the moved count with both project names", () => {
    const repo = makeFakeRepo([project("src", "orphan"), project("dst", "parent")]);

    const result = mergeProjects("src", "dst", repo);

    expect(repo.merge).toHaveBeenCalledWith("src", "dst");
    expect(result).toEqual({
      movedMemories: 3,
      source: { id: "src", name: "orphan" },
      target: { id: "dst", name: "parent" },
    });
  });

  it("throws when the source project does not exist", () => {
    const repo = makeFakeRepo([project("dst", "parent")]);

    expect(() => mergeProjects("missing", "dst", repo)).toThrow("Project not found: missing");
    expect(repo.merge).not.toHaveBeenCalled();
  });

  it("throws when the target project does not exist", () => {
    const repo = makeFakeRepo([project("src", "orphan")]);

    expect(() => mergeProjects("src", "missing", repo)).toThrow("Project not found: missing");
    expect(repo.merge).not.toHaveBeenCalled();
  });
});
