import type { Memory } from "../../schemas.js";
import { xmlEscape } from "./xml.js";

export function renderCapabilityContext(key: string, memories: readonly Memory[]): string {
  const memLines = memories.map(
    (m) => `  <memory type="${m.type}">${xmlEscape(m.content)}</memory>`
  );
  const nudge =
    "If you learn something transferable about this capability, " +
    `save it with scope "${key}" so it is available next time.`;
  return `<capability-memories key="${xmlEscape(key)}">\n${memLines.join("\n")}\n</capability-memories>\n${nudge}`;
}
