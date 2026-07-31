import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveThresholds, type Thresholds } from "../memory/domain/thresholds.js";

interface MemoryConfig {
  synthesis?: { enabled?: boolean };
  thresholds?: Record<string, unknown>;
}

function loadConfig(): MemoryConfig | null {
  const configPath = join(homedir(), ".membank", "config.json");
  try {
    const raw = readFileSync(configPath, "utf8");
    return JSON.parse(raw) as MemoryConfig;
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export function isSynthesisEnabled(): boolean {
  const config = loadConfig();
  return config?.synthesis?.enabled === true;
}

export function loadThresholds(): Thresholds {
  return resolveThresholds(loadConfig()?.thresholds ?? {});
}
