import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function sha256Truncated(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export async function resolveProject(): Promise<{ hash: string; name: string }> {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"]);
    const url = stdout.trim();
    if (url) {
      const hash = sha256Truncated(url);
      // parse last path segment, strip .git suffix
      const name =
        url
          .split("/")
          .pop()
          ?.replace(/\.git$/, "") ?? hash.slice(0, 8);
      return { hash, name };
    }
  } catch {
    // fall through
  }

  const cwd = process.cwd();
  const hash = sha256Truncated(cwd);
  const name = cwd.split(/[/\\]/).filter(Boolean).pop() ?? hash.slice(0, 8);
  return { hash, name };
}

export async function resolveScope(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"]);
    const url = stdout.trim();
    if (url) {
      return sha256Truncated(url);
    }
  } catch {
    // git not available, not a repo, or no remote — fall through to cwd fallback
  }

  return sha256Truncated(process.cwd());
}
