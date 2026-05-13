import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MemBankConfig {
  synthesis?: {
    enabled: boolean;
    maxTokensPerRun?: number;
    debounceMs?: number;
    stalenessDays?: number;
    inFlightTimeoutMs?: number;
  };
}

function defaultConfigPath(): string {
  return join(homedir(), ".membank", "config.json");
}

function readConfigFile(path: string): MemBankConfig {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as MemBankConfig;
  } catch {
    return {};
  }
}

export const ConfigManager = {
  getConfigPath(): string {
    return defaultConfigPath();
  },

  load(): MemBankConfig {
    return readConfigFile(ConfigManager.getConfigPath());
  },

  get(key: string): unknown {
    const config = ConfigManager.load();
    return key.split(".").reduce<unknown>((obj, part) => {
      if (obj !== null && typeof obj === "object" && part in obj) {
        return (obj as Record<string, unknown>)[part];
      }
      return undefined;
    }, config);
  },

  set(key: string, value: unknown): void {
    const config = ConfigManager.load();
    const parts = key.split(".");
    let cursor: Record<string, unknown> = config as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] as string;
      if (!(part in cursor) || typeof cursor[part] !== "object" || cursor[part] === null) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    const lastPart = parts[parts.length - 1] as string;
    cursor[lastPart] = value;
    ConfigManager.write(config);
  },

  write(config: MemBankConfig): void {
    const path = ConfigManager.getConfigPath();
    writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
  },
};
