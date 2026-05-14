import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runExtractionMock = vi.fn();

vi.mock("@membank/mcp", () => ({
  runExtraction: runExtractionMock,
}));

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stderr.write = orig;
  }
  return chunks.join("");
}

function pushStdin(payload: string): void {
  const stream = Readable.from([payload]);
  Object.defineProperty(stream, "isTTY", { value: false });
  Object.defineProperty(process, "stdin", { value: stream, configurable: true });
}

describe("extractCommand", () => {
  const originalStdin = process.stdin;

  beforeEach(() => {
    runExtractionMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "stdin", { value: originalStdin, configurable: true });
  });

  it("parses stdin payload and forwards to runExtraction", async () => {
    runExtractionMock.mockResolvedValue({ status: "completed" });
    pushStdin(
      JSON.stringify({
        session_id: "abc",
        transcript_path: "/tmp/transcript.jsonl",
        hook_event_name: "Stop",
        stop_hook_active: false,
      })
    );
    const { extractCommand } = await import("./extract.js");
    await extractCommand({});
    expect(runExtractionMock).toHaveBeenCalledWith({
      sessionId: "abc",
      transcriptPath: "/tmp/transcript.jsonl",
    });
  });

  it("skips when stop_hook_active is true", async () => {
    pushStdin(
      JSON.stringify({
        session_id: "abc",
        transcript_path: "/tmp/t.jsonl",
        stop_hook_active: true,
      })
    );
    const { extractCommand } = await import("./extract.js");
    const stderr = await captureStderr(() => extractCommand({}));
    expect(runExtractionMock).not.toHaveBeenCalled();
    expect(stderr).toContain("stop_hook_active");
  });

  it("emits a stderr note when runExtraction returns skipped", async () => {
    runExtractionMock.mockResolvedValue({ status: "skipped", reason: "in_flight" });
    pushStdin(JSON.stringify({ session_id: "abc", transcript_path: "/tmp/t.jsonl" }));
    const { extractCommand } = await import("./extract.js");
    const stderr = await captureStderr(() => extractCommand({}));
    expect(stderr).toContain("skipped (in_flight)");
  });

  it("emits a stderr note when runExtraction throws", async () => {
    runExtractionMock.mockRejectedValue(new Error("boom"));
    pushStdin(JSON.stringify({ session_id: "abc", transcript_path: "/tmp/t.jsonl" }));
    const { extractCommand } = await import("./extract.js");
    const stderr = await captureStderr(() => extractCommand({}));
    expect(stderr).toContain("boom");
  });

  it("ignores invalid JSON on stdin without throwing", async () => {
    pushStdin("not json");
    const { extractCommand } = await import("./extract.js");
    const stderr = await captureStderr(() => extractCommand({}));
    expect(runExtractionMock).not.toHaveBeenCalled();
    expect(stderr).toContain("not valid JSON");
  });
});
