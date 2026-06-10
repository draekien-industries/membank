import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function sha256Truncated(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

async function git(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args);
    return stdout.trim();
  } catch {
    return null;
  }
}

function lastSegment(path: string, fallback: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? fallback;
}

// `git worktree list --porcelain` always lists the main worktree first, identically
// across every linked worktree and subdirectory — so its path is a stable project identity.
async function mainWorktreeRoot(): Promise<string | null> {
  const out = await git(["worktree", "list", "--porcelain"]);
  const firstLine = out?.split("\n")[0];
  if (firstLine?.startsWith("worktree ")) {
    return firstLine.slice("worktree ".length).trim();
  }
  return null;
}

export async function resolveProject(): Promise<{ hash: string; name: string; origin: string }> {
  const remoteUrl = await git(["remote", "get-url", "origin"]);
  if (remoteUrl) {
    const hash = sha256Truncated(remoteUrl);
    const name =
      remoteUrl
        .split("/")
        .pop()
        ?.replace(/\.git$/, "") ?? hash.slice(0, 8);
    return { hash, name, origin: remoteUrl };
  }

  const mainRoot = await mainWorktreeRoot();
  if (mainRoot) {
    const hash = sha256Truncated(mainRoot);
    return { hash, name: lastSegment(mainRoot, hash.slice(0, 8)), origin: mainRoot };
  }

  const cwd = process.cwd();
  const hash = sha256Truncated(cwd);
  return { hash, name: lastSegment(cwd, hash.slice(0, 8)), origin: cwd };
}

export async function resolveScope(): Promise<string> {
  return (await resolveProject()).hash;
}

// The scope the buggy pre-worktree resolver produced in this directory: hash of cwd.
// Only meaningful inside a linked worktree, where cwd differs from the main worktree root;
// elsewhere there is no worktree orphan to find.
export async function resolveLegacyCwdScope(): Promise<{ hash: string } | null> {
  const gitDir = await git(["rev-parse", "--git-dir"]);
  const commonDir = await git(["rev-parse", "--git-common-dir"]);
  if (gitDir === null || commonDir === null) return null;
  if (resolve(gitDir) === resolve(commonDir)) return null;
  return { hash: sha256Truncated(process.cwd()) };
}
