import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type HarnessName = "claude-code" | "vscode" | "codex" | "opencode";

export interface DetectedHarness {
  name: HarnessName;
  configPath: string;
}

export interface PathResolver {
  homeDir: () => string;
  cwd: () => string;
}

const defaultResolver: PathResolver = {
  homeDir: homedir,
  cwd: () => process.cwd(),
};

function harnessConfigs(resolver: PathResolver): Array<{ name: HarnessName; configPath: string }> {
  const home = resolver.homeDir();
  const cwd = resolver.cwd();
  return [
    { name: "claude-code", configPath: join(home, ".claude", "settings.json") },
    { name: "vscode", configPath: join(cwd, ".vscode", "mcp.json") },
    { name: "codex", configPath: join(home, ".codex", "config.json") },
    { name: "opencode", configPath: join(home, ".config", "opencode", "config.json") },
  ];
}

export function detectHarnesses(resolver: PathResolver = defaultResolver): DetectedHarness[] {
  return harnessConfigs(resolver)
    .filter((h) => existsSync(h.configPath))
    .map((h) => ({ name: h.name, configPath: h.configPath }));
}
