import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type HarnessName = "claude-code" | "copilot" | "codex" | "opencode";

export interface DetectedHarness {
  name: HarnessName;
  configPath: string;
}

export interface PathResolver {
  homeDir: () => string;
}

const defaultResolver: PathResolver = {
  homeDir: homedir,
};

interface HarnessConfig {
  name: HarnessName;
  // Primary path shown to users and used by the writer.
  configPath: string;
  // Additional paths that indicate the harness is installed (e.g., legacy locations).
  fallbackPaths?: string[];
}

function harnessConfigs(resolver: PathResolver): HarnessConfig[] {
  const home = resolver.homeDir();
  return [
    {
      name: "claude-code",
      configPath: join(home, ".claude.json"),
      // Legacy path written by the old (buggy) setup command.
      fallbackPaths: [join(home, ".claude", "settings.json")],
    },
    {
      name: "copilot",
      configPath: join(home, ".copilot", "mcp-config.json"),
    },
    {
      name: "codex",
      configPath: join(home, ".codex", "config.toml"),
      // Legacy path written by the old (buggy) setup command.
      fallbackPaths: [join(home, ".codex", "config.json")],
    },
    {
      name: "opencode",
      configPath: join(home, ".config", "opencode", "opencode.json"),
      // Legacy path written by the old (buggy) setup command.
      fallbackPaths: [join(home, ".config", "opencode", "config.json")],
    },
  ];
}

export function detectHarnesses(resolver: PathResolver = defaultResolver): DetectedHarness[] {
  return harnessConfigs(resolver)
    .filter(
      (h) => existsSync(h.configPath) || (h.fallbackPaths?.some((p) => existsSync(p)) ?? false)
    )
    .map((h) => ({ name: h.name, configPath: h.configPath }));
}
