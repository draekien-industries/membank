import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type AutoMemoryStatus = "enabled" | "disabled";

type SettingsFile =
  | { kind: "absent" }
  | { kind: "parsed"; value: Record<string, unknown> }
  | { kind: "malformed" };

function defaultSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface AutoMemorySettings {
  readonly path: string;
  autoMemoryStatus(): AutoMemoryStatus;
  disableAutoMemory(): void;
}

export class ClaudeSettings implements AutoMemorySettings {
  readonly #path: string;

  constructor(path: string = defaultSettingsPath()) {
    this.#path = path;
  }

  get path(): string {
    return this.#path;
  }

  autoMemoryStatus(): AutoMemoryStatus {
    if (process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY === "1") return "disabled";
    const file = this.#read();
    if (file.kind !== "parsed") return "enabled";
    return file.value.autoMemoryEnabled === false ? "disabled" : "enabled";
  }

  disableAutoMemory(): void {
    const file = this.#read();
    if (file.kind === "malformed") {
      throw new Error(
        `${this.#path} is not valid JSON — fix it by hand, then set "autoMemoryEnabled": false`
      );
    }
    const current = file.kind === "parsed" ? file.value : {};
    mkdirSync(dirname(this.#path), { recursive: true });
    writeFileSync(
      this.#path,
      `${JSON.stringify({ ...current, autoMemoryEnabled: false }, null, 2)}\n`,
      "utf-8"
    );
  }

  #read(): SettingsFile {
    if (!existsSync(this.#path)) return { kind: "absent" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.#path, "utf-8"));
    } catch {
      return { kind: "malformed" };
    }
    if (!isRecord(parsed)) return { kind: "malformed" };
    return { kind: "parsed", value: parsed };
  }
}
