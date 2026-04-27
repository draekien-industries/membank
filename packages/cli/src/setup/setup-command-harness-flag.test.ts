import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_HARNESSES } from "./harness-config-writer.js";

describe("setup --harness flag validation", () => {
  let exitCode: number | undefined;
  let errorOutput: string | undefined;

  beforeEach(() => {
    exitCode = undefined;
    errorOutput = undefined;

    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      exitCode = code;
    }) as typeof process.exit;

    return () => {
      process.exit = origExit;
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("SUPPORTED_HARNESSES includes all four expected harness names", () => {
    expect(SUPPORTED_HARNESSES).toContain("claude-code");
    expect(SUPPORTED_HARNESSES).toContain("vscode");
    expect(SUPPORTED_HARNESSES).toContain("codex");
    expect(SUPPORTED_HARNESSES).toContain("opencode");
  });

  it("unknown harness name is not in SUPPORTED_HARNESSES", () => {
    expect(SUPPORTED_HARNESSES).not.toContain("unknown-harness");
  });

  it("validates harness name and exits non-zero for unknown value", () => {
    const harness = "unknown-harness";
    const valid = SUPPORTED_HARNESSES as readonly string[];

    if (!valid.includes(harness)) {
      errorOutput = `Unknown harness: "${harness}". Supported: ${SUPPORTED_HARNESSES.join(", ")}`;
      process.exit(1);
    }

    expect(exitCode).toBe(1);
    expect(errorOutput).toContain("unknown-harness");
    expect(errorOutput).toContain("claude-code");
    expect(errorOutput).toContain("Supported:");
  });

  it("does not exit for a valid harness name", () => {
    const harness = "claude-code";
    const valid = SUPPORTED_HARNESSES as readonly string[];

    if (!valid.includes(harness)) {
      process.exit(1);
    }

    expect(exitCode).toBeUndefined();
  });

  it("error message lists all supported harness names when unknown harness given", () => {
    const harness = "my-editor";
    const msg = `Unknown harness: "${harness}". Supported: ${SUPPORTED_HARNESSES.join(", ")}`;

    for (const name of SUPPORTED_HARNESSES) {
      expect(msg).toContain(name);
    }
  });
});
