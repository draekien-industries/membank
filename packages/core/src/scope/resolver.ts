import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function sha256Truncated(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
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
