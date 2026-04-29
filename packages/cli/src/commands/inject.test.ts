import { describe, expect, it } from "vitest";
import { isToolFailure, looksLikeFeedback } from "./inject.js";

describe("looksLikeFeedback", () => {
  it.each([
    "don't add comments",
    "stop doing that",
    "never use var",
    "always use const",
    "remember to add types",
    "I prefer tabs",
    "I want smaller functions",
    "I hate long lines",
    "from now on use semicolons",
    "keep in mind I use pnpm",
    "note that this repo uses ESM",
    "stop using classes",
    "that's wrong, use async/await",
    "no, actually use the other approach",
    "please don't add comments",
  ])("detects feedback: %s", (prompt) => {
    expect(looksLikeFeedback(prompt)).toBe(true);
  });

  it.each([
    "what is 2+2",
    "explain this function",
    "how does this work",
    "can you refactor this",
    "write a test for this",
    "fix the bug in line 42",
  ])("ignores non-feedback: %s", (prompt) => {
    expect(looksLikeFeedback(prompt)).toBe(false);
  });
});

describe("isToolFailure", () => {
  it("detects PostToolUseFailure event name", () => {
    expect(isToolFailure({ hook_event_name: "PostToolUseFailure", tool_name: "Bash" })).toBe(true);
  });

  it("detects non-empty error_message", () => {
    expect(isToolFailure({ error_message: "exit 1", tool_name: "Bash" })).toBe(true);
  });

  it("detects is_error on tool_result", () => {
    expect(isToolFailure({ tool_result: { is_error: true } })).toBe(true);
  });

  it("detects is_error on tool_response (alternative field name)", () => {
    expect(isToolFailure({ tool_response: { is_error: true } })).toBe(true);
  });

  it("returns false for successful PostToolUse", () => {
    expect(
      isToolFailure({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_result: { output: "ok" },
      })
    ).toBe(false);
  });

  it("returns false for empty data", () => {
    expect(isToolFailure({})).toBe(false);
  });

  it("returns false for empty error_message", () => {
    expect(isToolFailure({ error_message: "" })).toBe(false);
  });

  it("detects error field (Claude Code / copilot-cli)", () => {
    expect(isToolFailure({ error: "exit 1", tool_name: "Bash" })).toBe(true);
  });

  it("ignores empty error field", () => {
    expect(isToolFailure({ error: "" })).toBe(false);
  });

  it("detects Codex PostToolUse failure via exit_code", () => {
    expect(isToolFailure({ hook_event_name: "PostToolUse", tool_response: { exit_code: 1 } })).toBe(
      true
    );
  });

  it("ignores Codex PostToolUse success (exit_code 0)", () => {
    expect(isToolFailure({ hook_event_name: "PostToolUse", tool_response: { exit_code: 0 } })).toBe(
      false
    );
  });

  it("detects copilot-cli toolResult.resultType failure", () => {
    expect(isToolFailure({ toolResult: { resultType: "failure" } })).toBe(true);
  });

  it("ignores copilot-cli toolResult.resultType success", () => {
    expect(isToolFailure({ toolResult: { resultType: "success" } })).toBe(false);
  });
});
