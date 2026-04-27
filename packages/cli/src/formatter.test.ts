import { describe, expect, it } from "vitest";
import type { QueryResult } from "./formatter.js";
import { Formatter } from "./formatter.js";

function makeResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    id: "test-id",
    content: "Use TypeScript strict mode",
    type: "preference",
    tags: ["typescript"],
    scope: "global",
    score: 0.85,
    sourceHarness: null,
    accessCount: 0,
    pinned: false,
    needsReview: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join("");
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = original;
  }
  return chunks.join("");
}

describe("Formatter — JSON mode", () => {
  it("outputQueryResults emits a JSON array to stdout", () => {
    const formatter = new Formatter(true);
    const results = [makeResult()];
    const output = captureStdout(() => formatter.outputQueryResults(results));

    const parsed = JSON.parse(output) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
  });

  it("outputQueryResults emits no decorative text in JSON mode", () => {
    const formatter = new Formatter(true);
    const results = [makeResult()];
    const output = captureStdout(() => formatter.outputQueryResults(results));

    expect(() => JSON.parse(output.trim())).not.toThrow();
  });

  it("error emits JSON to stderr", () => {
    const formatter = new Formatter(true);
    const output = captureStderr(() => formatter.error("something went wrong"));

    const parsed = JSON.parse(output) as { error: string };
    expect(parsed.error).toBe("something went wrong");
  });

  it("empty results produce an empty JSON array", () => {
    const formatter = new Formatter(true);
    const output = captureStdout(() => formatter.outputQueryResults([]));

    const parsed = JSON.parse(output) as unknown[];
    expect(parsed).toEqual([]);
  });
});

describe("Formatter — human mode", () => {
  it("outputQueryResults shows id, type, content, tags, scope", () => {
    const formatter = new Formatter(false);
    const result = makeResult({ tags: ["ts", "strict"] });
    const output = captureStdout(() => formatter.outputQueryResults([result]));

    expect(output).toContain(result.id);
    expect(output).toContain(result.type);
    expect(output).toContain(result.content);
    expect(output).toContain("ts");
    expect(output).toContain("strict");
    expect(output).toContain(result.scope);
  });

  it("empty results print a human-readable message", () => {
    const formatter = new Formatter(false);
    const output = captureStdout(() => formatter.outputQueryResults([]));

    expect(output).toContain("No memories found");
  });
});

describe("Formatter — TTY detection", () => {
  it("isJson is false when process.stdout.isTTY is true", () => {
    const saved = process.stdout.isTTY;
    process.stdout.isTTY = true;
    try {
      const f = Formatter.create();
      expect(f.isJson).toBe(false);
    } finally {
      process.stdout.isTTY = saved;
    }
  });

  it("isJson is true when process.stdout.isTTY is falsy (non-TTY = implicit JSON mode)", () => {
    const saved = process.stdout.isTTY;
    process.stdout.isTTY = undefined as unknown as true;
    try {
      const f = Formatter.create();
      expect(f.isJson).toBe(true);
    } finally {
      process.stdout.isTTY = saved;
    }
  });
});
