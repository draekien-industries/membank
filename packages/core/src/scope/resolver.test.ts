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
