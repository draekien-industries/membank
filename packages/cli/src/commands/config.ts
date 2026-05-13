import { ConfigManager } from "../config/index.js";
import type { Formatter } from "../formatter.js";

function parseValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (!Number.isNaN(n) && raw.trim() !== "") return n;
  return raw;
}

export function configGetCommand(key: string, formatter: Formatter): void {
  const value = ConfigManager.get(key);
  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify({ key, value })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }
}

export function configSetCommand(key: string, rawValue: string, formatter: Formatter): void {
  const value = parseValue(rawValue);
  ConfigManager.set(key, value);
  if (formatter.isJson) {
    process.stdout.write(`${JSON.stringify({ key, value })}\n`);
  } else {
    process.stdout.write(`Set ${key} = ${JSON.stringify(value)}\n`);
  }
}

export function configShowCommand(formatter: Formatter): void {
  const config = ConfigManager.load();
  process.stdout.write(`${JSON.stringify(config, null, formatter.isJson ? 0 : 2)}\n`);
}
