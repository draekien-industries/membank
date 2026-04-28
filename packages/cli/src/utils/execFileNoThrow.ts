import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (cmd: string, args: string[]) => Promise<ExecResult>;

// On Windows, npm-installed CLIs are .cmd wrappers and won't resolve without the extension.
function resolveCmd(cmd: string): string {
  return process.platform === "win32" ? `${cmd}.cmd` : cmd;
}

export async function execFileNoThrow(cmd: string, args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(resolveCmd(cmd), args, { encoding: "utf8" });
    return { stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 };
  } catch (err) {
    if (err !== null && typeof err === "object" && "code" in err) {
      const e = err as { code: string | number; stdout?: string; stderr?: string };
      if (e.code === "ENOENT") {
        return { stdout: "", stderr: `Command not found: ${cmd}`, exitCode: 127 };
      }
      return {
        stdout: typeof e.stdout === "string" ? e.stdout : "",
        stderr: typeof e.stderr === "string" ? e.stderr : "",
        exitCode: typeof e.code === "number" ? e.code : 1,
      };
    }
    return { stdout: "", stderr: err instanceof Error ? err.message : String(err), exitCode: 1 };
  }
}
