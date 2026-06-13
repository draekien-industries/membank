import type { Memory, SessionContext } from "../../schemas.js";

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderSessionContext(ctx: SessionContext): string {
  const parts: string[] = [];

  const allPinned: Memory[] = [...ctx.pinnedGlobal, ...ctx.pinnedProject];
  if (allPinned.length > 0) {
    const memLines = allPinned.map(
      (m) => `  <memory type="${m.type}">${xmlEscape(m.content)}</memory>`
    );
    parts.push(`<pinned-memories>\n${memLines.join("\n")}\n</pinned-memories>`);
  }

  for (const section of ctx.sections) {
    if (section.kind === "synthesis") {
      parts.push(`<synthesis type="${section.memoryType}">\n${section.content}\n</synthesis>`);
    } else {
      const memLines = section.memories.map(
        (content) => `  <memory>${xmlEscape(content)}</memory>`
      );
      parts.push(`<memories type="${section.memoryType}">\n${memLines.join("\n")}\n</memories>`);
    }
  }

  return parts.join("\n");
}
