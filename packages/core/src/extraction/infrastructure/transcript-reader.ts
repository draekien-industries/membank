import { readFile } from "node:fs/promises";
import { CHUNK_MAX_CHARS, chunkTurns } from "../domain/transcript-chunking.js";
import type { TranscriptReader } from "../ports.js";

interface TranscriptReaderOptions {
  maxChars?: number;
}

interface ClaudeCodeTranscriptLine {
  type?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as { type?: string; text?: unknown; name?: unknown; input?: unknown };
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
    } else if (b.type === "tool_use" && typeof b.name === "string") {
      parts.push(`[tool_use: ${b.name}]`);
    } else if (b.type === "tool_result") {
      parts.push("[tool_result]");
    }
  }
  return parts.join("\n");
}

class ClaudeCodeTranscriptReader implements TranscriptReader {
  readonly #maxChars: number;

  constructor(opts: TranscriptReaderOptions = {}) {
    this.#maxChars = opts.maxChars ?? CHUNK_MAX_CHARS;
  }

  async read(transcriptPath: string): Promise<string[]> {
    const raw = await readFile(transcriptPath, "utf8");
    const lines = raw.split("\n").filter((l) => l.length > 0);

    const turns: string[] = [];
    for (const line of lines) {
      let parsed: ClaudeCodeTranscriptLine;
      try {
        parsed = JSON.parse(line) as ClaudeCodeTranscriptLine;
      } catch {
        continue;
      }
      const role = parsed.message?.role;
      if (role !== "user" && role !== "assistant") continue;
      const text = extractText(parsed.message?.content).trim();
      if (text.length === 0) continue;
      turns.push(`${role}: ${text}`);
    }

    return chunkTurns(turns, this.#maxChars);
  }
}

export function createClaudeCodeTranscriptReader(
  opts: TranscriptReaderOptions = {}
): TranscriptReader {
  return new ClaudeCodeTranscriptReader(opts);
}
