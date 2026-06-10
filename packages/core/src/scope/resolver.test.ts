import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function sha256Truncated(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

describe("resolveScope", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the same hash for the same git remote URL (determinism)", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: vi.fn((_cmd, _args, cb) =>
        cb(null, { stdout: "https://github.com/org/repo.git\n", stderr: "" })
      ),
    }));

    const { resolveScope } = await import("./resolver.js");
    const result1 = await resolveScope();
    const result2 = await resolveScope();
    expect(result1).toBe(result2);
    expect(result1).toBe(sha256Truncated("https://github.com/org/repo.git"));
  });

  it("returns the same hash for the same cwd when git fails (determinism)", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: vi.fn((_cmd, _args, cb) => cb(new Error("not a git repo"), null)),
    }));

    const { resolveScope } = await import("./resolver.js");
    const result1 = await resolveScope();
    const result2 = await resolveScope();
    expect(result1).toBe(result2);
    expect(result1).toBe(sha256Truncated(process.cwd()));
  });

  it("git remote URL hash differs from cwd hash for the same string used as both", async () => {
    // Use process.cwd() as both the remote URL and the cwd input to confirm
    // the two code paths would produce the same hash for identical inputs —
    // but a real remote URL and the cwd are different strings, so their
    // hashes will differ. Here we use distinct strings to make it explicit.
    const remoteUrl = "https://github.com/org/repo.git";
    const cwd = process.cwd();
    expect(sha256Truncated(remoteUrl)).not.toBe(sha256Truncated(cwd));
  });

  it("silently falls back to cwd hash when git fails", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: vi.fn((_cmd, _args, cb) => cb(new Error("git: command not found"), null)),
    }));

    const { resolveScope } = await import("./resolver.js");
    const result = await resolveScope();
    expect(result).toBe(sha256Truncated(process.cwd()));
  });

  it("returns exactly 16 hex characters", async () => {
    vi.doMock("node:child_process", () => ({
      execFile: vi.fn((_cmd, _args, cb) =>
        cb(null, { stdout: "git@github.com:org/repo.git\n", stderr: "" })
      ),
    }));

    const { resolveScope } = await import("./resolver.js");
    const result = await resolveScope();
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });
});

type GitResponse = { stdout: string } | Error;

function mockGit(respond: (args: string[]) => GitResponse): void {
  vi.doMock("node:child_process", () => ({
    execFile: vi.fn(
      (_cmd: string, args: string[], cb: (err: Error | null, out: unknown) => void) => {
        const result = respond(args);
        if (result instanceof Error) cb(result, null);
        else cb(null, { stdout: result.stdout, stderr: "" });
      }
    ),
  }));
}

describe("resolveProject (worktree-aware)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves to the git remote URL when one exists", async () => {
    mockGit((args) => {
      if (args[0] === "remote") return { stdout: "https://github.com/org/repo.git\n" };
      return new Error("unexpected git command");
    });

    const { resolveProject } = await import("./resolver.js");
    const result = await resolveProject();
    expect(result.origin).toBe("https://github.com/org/repo.git");
    expect(result.hash).toBe(sha256Truncated("https://github.com/org/repo.git"));
    expect(result.name).toBe("repo");
  });

  it("resolves a remote-less worktree to its main worktree root", async () => {
    mockGit((args) => {
      if (args[0] === "remote") return new Error("no remote configured");
      if (args[0] === "worktree") {
        return {
          stdout:
            "worktree /repos/main\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repos/.worktrees/feature\n",
        };
      }
      return new Error("unexpected git command");
    });

    const { resolveProject } = await import("./resolver.js");
    const result = await resolveProject();
    expect(result.origin).toBe("/repos/main");
    expect(result.hash).toBe(sha256Truncated("/repos/main"));
    expect(result.name).toBe("main");
  });

  it("falls back to cwd when not a git repository", async () => {
    mockGit(() => new Error("not a git repository"));

    const { resolveProject } = await import("./resolver.js");
    const result = await resolveProject();
    expect(result.origin).toBe(process.cwd());
    expect(result.hash).toBe(sha256Truncated(process.cwd()));
  });
});

describe("resolveLegacyCwdScope", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the cwd hash inside a linked worktree", async () => {
    mockGit((args) => {
      if (args[1] === "--git-dir") return { stdout: "/repos/main/.git/worktrees/feature\n" };
      if (args[1] === "--git-common-dir") return { stdout: "/repos/main/.git\n" };
      return new Error("unexpected git command");
    });

    const { resolveLegacyCwdScope } = await import("./resolver.js");
    const result = await resolveLegacyCwdScope();
    expect(result).toEqual({ hash: sha256Truncated(process.cwd()) });
  });

  it("returns null in the main worktree (git-dir equals git-common-dir)", async () => {
    mockGit((args) => {
      if (args[1] === "--git-dir") return { stdout: ".git\n" };
      if (args[1] === "--git-common-dir") return { stdout: ".git\n" };
      return new Error("unexpected git command");
    });

    const { resolveLegacyCwdScope } = await import("./resolver.js");
    expect(await resolveLegacyCwdScope()).toBeNull();
  });

  it("returns null outside any git repository", async () => {
    mockGit(() => new Error("not a git repository"));

    const { resolveLegacyCwdScope } = await import("./resolver.js");
    expect(await resolveLegacyCwdScope()).toBeNull();
  });
});
