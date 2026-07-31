import { describe, expect, it } from "vitest";
import type { Project } from "../../schemas.js";
import { findSplitScopePairs } from "./split-scope.js";

function project(name: string, origin: string | null, id = `${name}-${origin ?? "none"}`): Project {
  return {
    id,
    name,
    scopeHash: id.slice(0, 16),
    origin,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("findSplitScopePairs", () => {
  it("pairs a filesystem-rooted project with the git-remote project of the same name", () => {
    const local = project("dia", "F:/Dev/dia");
    const remote = project("dia", "git@github.com:acme/dia.git");

    expect(findSplitScopePairs([local, remote])).toEqual([{ local, remote }]);
  });

  it("recognises https, ssh and git remotes as the remote half", () => {
    for (const origin of [
      "https://github.com/acme/x.git",
      "ssh://git@host/acme/x",
      "git://host/acme/x",
    ]) {
      const pairs = findSplitScopePairs([project("x", "/home/w/x"), project("x", origin)]);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]?.remote.origin).toBe(origin);
    }
  });

  it("ignores names with no local half or no remote half", () => {
    expect(findSplitScopePairs([project("solo", "git@github.com:acme/solo.git")])).toEqual([]);
    expect(findSplitScopePairs([project("solo", "/home/w/solo")])).toEqual([]);
  });

  it("ignores ambiguous groups with more than one candidate per side", () => {
    const projects = [
      project("dup", "/home/w/dup", "a"),
      project("dup", "/other/dup", "b"),
      project("dup", "git@github.com:acme/dup.git", "c"),
    ];

    expect(findSplitScopePairs(projects)).toEqual([]);
  });

  it("ignores projects with no origin", () => {
    expect(findSplitScopePairs([project("g", null), project("g", "git@h:a/g.git")])).toEqual([]);
  });
});
