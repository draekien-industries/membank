import { describe, expect, it, vi } from "vitest";
import type { HarnessConfigWriter } from "./harness-config-writer.js";
import type { DetectedHarness } from "./harness-detector.js";
import type { InjectionHookWriter, InspectResult } from "./injection-hook-writer.js";
import { SetupOrchestrator } from "./setup-orchestrator.js";

// Minimal HarnessConfigWriter stub
function makeWriter(
  responses: Record<string, { status: "written" | "already-configured" } | (() => never)> = {}
): HarnessConfigWriter {
  return {
    write: vi.fn((harness: string, opts?: { overwrite?: boolean }) => {
      const key = opts?.overwrite ? `${harness}:overwrite` : harness;
      const res = responses[key] ?? responses[harness] ?? { status: "written" };
      if (typeof res === "function") return res();
      return res;
    }),
  } as unknown as HarnessConfigWriter;
}

function makeHarness(name: string): DetectedHarness {
  return { name: name as DetectedHarness["name"], configPath: `/fake/${name}/config.json` };
}

// Helper that builds an orchestrator and captures its output
function makeOrchestrator(opts: {
  detected?: DetectedHarness[];
  writer?: HarnessConfigWriter;
  prompter?: (q: string) => Promise<boolean>;
  modelDownloader?: { download: () => Promise<{ skipped: boolean }> };
}): { orchestrator: SetupOrchestrator; lines: string[] } {
  const lines: string[] = [];
  const detected = opts.detected;
  const orchestrator = new SetupOrchestrator({
    detector: detected !== undefined ? () => detected : undefined,
    writer: opts.writer ?? makeWriter(),
    prompter: opts.prompter,
    modelDownloader: opts.modelDownloader,
    out: (msg) => lines.push(msg),
  });
  return { orchestrator, lines };
}

// --- AC: no harnesses detected ---

describe("no harnesses detected", () => {
  it("prints a no-harnesses message and returns empty results", async () => {
    const { orchestrator, lines } = makeOrchestrator({ detected: [] });
    const results = await orchestrator.run({ yes: true });

    expect(results).toHaveLength(0);
    expect(lines.some((l) => l.includes("No supported harnesses detected"))).toBe(true);
  });
});

// --- AC: detection + planned changes ---

describe("detection output", () => {
  it("lists each detected harness before writing", async () => {
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("copilot")],
    });
    await orchestrator.run({ yes: true });

    expect(lines.some((l) => l.includes("claude-code"))).toBe(true);
    expect(lines.some((l) => l.includes("copilot"))).toBe(true);
  });
});

// --- AC: prompt before writing ---

describe("confirmation prompt", () => {
  it("prompts the user when --yes is not set", async () => {
    const prompter = vi.fn().mockResolvedValue(true);
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      prompter,
    });

    await orchestrator.run({ yes: false });

    expect(prompter).toHaveBeenCalledOnce();
  });

  it("skips the prompt when --yes is set", async () => {
    const prompter = vi.fn().mockResolvedValue(true);
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      prompter,
    });

    await orchestrator.run({ yes: true });

    expect(prompter).not.toHaveBeenCalled();
  });

  it("aborts and returns empty results when user declines", async () => {
    const prompter = vi.fn().mockResolvedValue(false);
    const writer = makeWriter();
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      writer,
      prompter,
    });

    const results = await orchestrator.run({ yes: false });

    expect(results).toHaveLength(0);
    expect(writer.write).not.toHaveBeenCalled();
  });
});

// --- AC: per-harness ✓ / ✗ results ---

describe("writing results", () => {
  it("marks each harness ✓ written when write succeeds", async () => {
    const writer = makeWriter({ "claude-code": { status: "written" } });
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      writer,
    });

    const results = await orchestrator.run({ yes: true });

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("written");
    expect(lines.some((l) => l.includes("✓") && l.includes("claude-code"))).toBe(true);
  });

  it("marks harness ✗ error when writer throws", async () => {
    const writer = makeWriter({
      "claude-code": () => {
        throw new Error("disk full");
      },
    });
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      writer,
    });

    const results = await orchestrator.run({ yes: true });

    expect(results[0]?.status).toBe("error");
    expect(results[0]?.error).toContain("disk full");
    expect(lines.some((l) => l.includes("✗") && l.includes("claude-code"))).toBe(true);
  });

  it("continues writing remaining harnesses after one error", async () => {
    const writer = makeWriter({
      "claude-code": () => {
        throw new Error("fail");
      },
      copilot: { status: "written" },
    });
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("copilot")],
      writer,
    });

    const results = await orchestrator.run({ yes: true });

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe("error");
    expect(results[1]?.status).toBe("written");
  });
});

// --- AC: already-configured harnesses ---

describe("already-configured harnesses", () => {
  it("prompts to overwrite when harness is already configured and --yes is not set", async () => {
    const writer = makeWriter({
      "claude-code": { status: "already-configured" },
      "claude-code:overwrite": { status: "written" },
    });
    const prompter = vi.fn().mockResolvedValue(true);
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      writer,
      prompter,
    });

    const results = await orchestrator.run({ yes: false });

    // First call = "Proceed?", second call = "already configured. Overwrite?"
    expect(prompter).toHaveBeenCalledTimes(2);
    expect(results[0]?.status).toBe("written");
  });

  it("skips overwrite prompt and overwrites when --yes is set", async () => {
    const writer = makeWriter({
      "claude-code": { status: "already-configured" },
      "claude-code:overwrite": { status: "written" },
    });
    const prompter = vi.fn();
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      writer,
      prompter,
    });

    const results = await orchestrator.run({ yes: true });

    expect(prompter).not.toHaveBeenCalled();
    expect(results[0]?.status).toBe("written");
  });

  it("marks harness ⚠ already-configured when user declines overwrite", async () => {
    const writer = makeWriter({ "claude-code": { status: "already-configured" } });
    const prompter = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      writer,
      prompter,
    });

    const results = await orchestrator.run({ yes: false });

    expect(results[0]?.status).toBe("already-configured");
    expect(lines.some((l) => l.includes("⚠") && l.includes("claude-code"))).toBe(true);
  });
});

// --- AC: --dry-run ---

describe("--dry-run", () => {
  it("prints planned changes without calling writer.write", async () => {
    const writer = makeWriter();
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("copilot")],
      writer,
    });

    const results = await orchestrator.run({ dryRun: true });

    expect(writer.write).not.toHaveBeenCalled();
    expect(results.every((r) => r.status === "skipped")).toBe(true);
    expect(lines.some((l) => l.toLowerCase().includes("dry-run"))).toBe(true);
  });

  it("skips the confirmation prompt in dry-run mode", async () => {
    const prompter = vi.fn();
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      prompter,
    });

    await orchestrator.run({ dryRun: true });

    expect(prompter).not.toHaveBeenCalled();
  });
});

// --- AC: final summary line ---

describe("final summary", () => {
  it("prints a summary with written and error counts", async () => {
    const writer = makeWriter({
      "claude-code": { status: "written" },
      copilot: () => {
        throw new Error("fail");
      },
    });
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("copilot")],
      writer,
    });

    await orchestrator.run({ yes: true });

    const summary = lines.find((l) => l.includes("Setup complete"));
    expect(summary).toBeDefined();
    expect(summary).toContain("1 written");
    expect(summary).toContain("1 errors");
  });
});

// --- AC: model downloader injection point ---

describe("model downloader injection", () => {
  it("calls modelDownloader.download() when injected", async () => {
    const download = vi.fn().mockResolvedValue({ skipped: false });
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      modelDownloader: { download },
    });

    await orchestrator.run({ yes: true });

    expect(download).toHaveBeenCalledOnce();
  });

  it("prints DRA-52 placeholder when no model downloader injected", async () => {
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
    });

    await orchestrator.run({ yes: true });

    expect(lines.some((l) => l.includes("DRA-52"))).toBe(true);
  });
});

// --- AC: --harness flag ---

describe("--harness flag", () => {
  it("configures only the named harness, skipping detection", async () => {
    const detectorFn = vi.fn().mockReturnValue([makeHarness("copilot"), makeHarness("codex")]);
    const writer = makeWriter({ "claude-code": { status: "written" } });
    const lines: string[] = [];
    const orchestrator = new SetupOrchestrator({
      detector: detectorFn,
      writer,
      out: (msg) => lines.push(msg),
    });

    const results = await orchestrator.run({ yes: true, harness: "claude-code" });

    expect(detectorFn).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]?.harness).toBe("claude-code");
    expect(results[0]?.status).toBe("written");
  });

  it("writes only the targeted harness when others are also installed", async () => {
    const writer = makeWriter({
      "claude-code": { status: "written" },
      copilot: { status: "written" },
    });
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("copilot")],
      writer,
    });

    const results = await orchestrator.run({ yes: true, harness: "claude-code" });

    expect(results).toHaveLength(1);
    expect(results[0]?.harness).toBe("claude-code");
    expect(writer.write).toHaveBeenCalledTimes(1);
  });
});

// --- AC: --json output ---

describe("--json output", () => {
  it("emits a single JSON line instead of decorated output", async () => {
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
    });

    await orchestrator.run({ yes: true, json: true });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "null");
    expect(parsed).toMatchObject({
      detectedHarnesses: ["claude-code"],
      configuredHarnesses: ["claude-code"],
      modelDownloaded: false,
    });
  });

  it("suppresses spinners and decorative symbols", async () => {
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
    });

    await orchestrator.run({ yes: true, json: true });

    const allOutput = lines.join("\n");
    expect(allOutput).not.toContain("✓");
    expect(allOutput).not.toContain("✗");
    expect(allOutput).not.toContain("•");
    expect(allOutput).not.toContain("Setup complete");
    expect(allOutput).not.toContain("Detected harnesses");
  });

  it("JSON shape includes detectedHarnesses, configuredHarnesses, modelDownloaded", async () => {
    const writer = makeWriter({
      "claude-code": { status: "written" },
      copilot: () => {
        throw new Error("fail");
      },
    });
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("copilot")],
      writer,
    });

    await orchestrator.run({ yes: true, json: true });

    const parsed = JSON.parse(lines[0] ?? "null") as {
      detectedHarnesses: string[];
      configuredHarnesses: string[];
      modelDownloaded: boolean;
    };
    expect(parsed.detectedHarnesses).toEqual(["claude-code", "copilot"]);
    expect(parsed.configuredHarnesses).toEqual(["claude-code"]);
    expect(parsed.modelDownloaded).toBe(false);
  });

  it("reflects modelDownloaded: true when downloader does not skip", async () => {
    const download = vi.fn().mockResolvedValue({ skipped: false });
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      modelDownloader: { download },
    });

    await orchestrator.run({ yes: true, json: true });

    const parsed = JSON.parse(lines[0] ?? "null") as { modelDownloaded: boolean };
    expect(parsed.modelDownloaded).toBe(true);
  });
});

// --- AC: injection hook writer integration ---

function makeHookWriter(
  inspectResults: Record<string, InspectResult> = {},
  writeFn?: (harness: string, events: string[]) => void
): InjectionHookWriter {
  return {
    inspect: vi.fn((harness: string) => {
      return inspectResults[harness] ?? { status: "ready", hooks: [] };
    }),
    write: vi.fn((harness: string, events: string[]) => {
      writeFn?.(harness, events);
      return { status: "written" };
    }),
  } as unknown as InjectionHookWriter;
}

function makeNewHook(event: string, command: string) {
  return { event, command, existingCommand: null };
}

function makeExistingHook(event: string, command: string, existing?: string) {
  return { event, command, existingCommand: existing ?? command };
}

function makeOrchestratorWithHooks(opts: {
  detected: DetectedHarness[];
  hookWriter: InjectionHookWriter;
  prompter?: (q: string) => Promise<boolean>;
}): { orchestrator: SetupOrchestrator; lines: string[] } {
  const lines: string[] = [];
  const orchestrator = new SetupOrchestrator({
    detector: () => opts.detected,
    writer: makeWriter(),
    hookWriter: opts.hookWriter,
    prompter: opts.prompter,
    out: (msg) => lines.push(msg),
  });
  return { orchestrator, lines };
}

describe("injection hook writer integration", () => {
  it("calls hookWriter.inspect for each detected harness", async () => {
    const hookWriter = makeHookWriter();
    const { orchestrator } = makeOrchestratorWithHooks({
      detected: [makeHarness("claude-code"), makeHarness("copilot-cli")],
      hookWriter,
    });
    await orchestrator.run({ yes: true });
    expect(hookWriter.inspect).toHaveBeenCalledWith("claude-code");
    expect(hookWriter.inspect).toHaveBeenCalledWith("copilot-cli");
  });

  it("calls hookWriter.write with approved events when yes=true", async () => {
    const hookWriter = makeHookWriter({
      "claude-code": {
        status: "ready",
        hooks: [
          makeNewHook("SessionStart", "npx @membank/cli inject --harness claude-code"),
          makeNewHook(
            "UserPromptSubmit",
            "npx @membank/cli inject --event user-prompt --harness claude-code"
          ),
          makeNewHook(
            "PostToolUseFailure",
            "npx @membank/cli inject --event tool-failure --harness claude-code"
          ),
        ],
      },
    });
    const { orchestrator } = makeOrchestratorWithHooks({
      detected: [makeHarness("claude-code")],
      hookWriter,
    });
    await orchestrator.run({ yes: true });
    expect(hookWriter.write).toHaveBeenCalledWith("claude-code", [
      "SessionStart",
      "UserPromptSubmit",
      "PostToolUseFailure",
    ]);
  });

  it("reports written injection hooks as ✓", async () => {
    const hookWriter = makeHookWriter({
      "claude-code": {
        status: "ready",
        hooks: [makeNewHook("SessionStart", "npx @membank/cli inject --harness claude-code")],
      },
    });
    const { orchestrator, lines } = makeOrchestratorWithHooks({
      detected: [makeHarness("claude-code")],
      hookWriter,
    });
    await orchestrator.run({ yes: true });
    expect(
      lines.some(
        (l) => l.includes("✓") && l.includes("claude-code") && l.includes("injection hook")
      )
    ).toBe(true);
  });

  it("prompts per-hook when hooks are new and --yes not set", async () => {
    const hookWriter = makeHookWriter({
      "claude-code": {
        status: "ready",
        hooks: [
          makeNewHook("SessionStart", "npx @membank/cli inject --harness claude-code"),
          makeNewHook(
            "UserPromptSubmit",
            "npx @membank/cli inject --event user-prompt --harness claude-code"
          ),
        ],
      },
    });
    const prompter = vi.fn().mockResolvedValue(true);
    const { orchestrator } = makeOrchestratorWithHooks({
      detected: [makeHarness("claude-code")],
      hookWriter,
      prompter,
    });
    await orchestrator.run({ yes: false });
    // "Proceed with writing configs?" + 2 hook prompts
    expect(prompter).toHaveBeenCalledTimes(3);
  });

  it("already-configured hook: prompts per-hook to replace when --yes not set", async () => {
    const hookWriter = makeHookWriter({
      "claude-code": {
        status: "ready",
        hooks: [makeExistingHook("SessionStart", "npx @membank/cli inject --harness claude-code")],
      },
    });
    const prompter = vi.fn().mockResolvedValue(true);
    const { orchestrator } = makeOrchestratorWithHooks({
      detected: [makeHarness("claude-code")],
      hookWriter,
      prompter,
    });
    await orchestrator.run({ yes: false });
    // "Proceed with writing configs?" + "Replace SessionStart injection hook for claude-code?"
    expect(prompter).toHaveBeenCalledTimes(2);
    expect(hookWriter.write).toHaveBeenCalledWith("claude-code", ["SessionStart"]);
  });

  it("already-configured hooks: auto-approves with --yes (idempotent re-run)", async () => {
    const hookWriter = makeHookWriter({
      "claude-code": {
        status: "ready",
        hooks: [
          makeExistingHook("SessionStart", "npx @membank/cli inject --harness claude-code"),
          makeExistingHook(
            "UserPromptSubmit",
            "npx @membank/cli inject --event user-prompt --harness claude-code"
          ),
          makeExistingHook(
            "PostToolUseFailure",
            "npx @membank/cli inject --event tool-failure --harness claude-code"
          ),
        ],
      },
    });
    const prompter = vi.fn();
    const { orchestrator, lines } = makeOrchestratorWithHooks({
      detected: [makeHarness("claude-code")],
      hookWriter,
      prompter,
    });
    await orchestrator.run({ yes: true });
    expect(prompter).not.toHaveBeenCalled();
    expect(hookWriter.write).toHaveBeenCalledWith("claude-code", [
      "SessionStart",
      "UserPromptSubmit",
      "PostToolUseFailure",
    ]);
    expect(lines.some((l) => l.includes("✓") && l.includes("injection hook"))).toBe(true);
  });

  it("skips hook writing in --dry-run mode", async () => {
    const hookWriter = makeHookWriter({
      "claude-code": {
        status: "ready",
        hooks: [makeNewHook("SessionStart", "npx @membank/cli inject --harness claude-code")],
      },
    });
    const { orchestrator, lines } = makeOrchestratorWithHooks({
      detected: [makeHarness("claude-code")],
      hookWriter,
    });
    await orchestrator.run({ dryRun: true });
    expect(hookWriter.write).not.toHaveBeenCalled();
    expect(lines.some((l) => l.includes("would write injection hook"))).toBe(true);
  });

  it("writes only hooks the user approves", async () => {
    const hookWriter = makeHookWriter({
      "claude-code": {
        status: "ready",
        hooks: [
          makeNewHook("SessionStart", "npx @membank/cli inject --harness claude-code"),
          makeNewHook(
            "UserPromptSubmit",
            "npx @membank/cli inject --event user-prompt --harness claude-code"
          ),
          makeNewHook(
            "PostToolUseFailure",
            "npx @membank/cli inject --event tool-failure --harness claude-code"
          ),
        ],
      },
    });
    // Proceed=yes, SessionStart=yes, UserPromptSubmit=no, PostToolUseFailure=yes
    const prompter = vi
      .fn()
      .mockResolvedValueOnce(true) // Proceed?
      .mockResolvedValueOnce(true) // SessionStart?
      .mockResolvedValueOnce(false) // UserPromptSubmit?
      .mockResolvedValueOnce(true); // PostToolUseFailure?
    const { orchestrator } = makeOrchestratorWithHooks({
      detected: [makeHarness("claude-code")],
      hookWriter,
      prompter,
    });
    await orchestrator.run({ yes: false });
    expect(hookWriter.write).toHaveBeenCalledWith("claude-code", [
      "SessionStart",
      "PostToolUseFailure",
    ]);
  });

  it("does not call write when user declines all hooks", async () => {
    const hookWriter = makeHookWriter({
      "claude-code": {
        status: "ready",
        hooks: [makeNewHook("SessionStart", "npx @membank/cli inject --harness claude-code")],
      },
    });
    const prompter = vi.fn().mockResolvedValue(false); // decline everything
    const { orchestrator } = makeOrchestratorWithHooks({
      detected: [makeHarness("claude-code")],
      hookWriter,
      prompter,
    });
    await orchestrator.run({ yes: false });
    expect(hookWriter.write).not.toHaveBeenCalled();
  });

  it("includes injectionHooksConfigured in JSON output", async () => {
    const hookWriter = makeHookWriter({
      "claude-code": {
        status: "ready",
        hooks: [makeNewHook("SessionStart", "npx @membank/cli inject --harness claude-code")],
      },
    });
    const lines: string[] = [];
    const orchestrator = new SetupOrchestrator({
      detector: () => [makeHarness("claude-code")],
      writer: makeWriter(),
      hookWriter,
      out: (msg) => lines.push(msg),
    });
    await orchestrator.run({ yes: true, json: true });
    const parsed = JSON.parse(lines[0] ?? "null") as { injectionHooksConfigured: string[] };
    expect(parsed.injectionHooksConfigured).toContain("claude-code");
  });
});

// --- AC: partial failure reporting and exit code propagation ---

describe("partial failure reporting", () => {
  it("returns error status for failed harness alongside written status for successful one", async () => {
    const writer = makeWriter({
      "claude-code": { status: "written" },
      copilot: () => {
        throw new Error("permission denied");
      },
    });
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("copilot")],
      writer,
    });

    const results = await orchestrator.run({ yes: true });

    const claudeResult = results.find((r) => r.harness === "claude-code");
    const copilotResult = results.find((r) => r.harness === "copilot");
    expect(claudeResult?.status).toBe("written");
    expect(copilotResult?.status).toBe("error");
    expect(copilotResult?.error).toContain("permission denied");
  });

  it("includes error reason in each failed result", async () => {
    const writer = makeWriter({
      "claude-code": () => {
        throw new Error("disk full");
      },
    });
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code")],
      writer,
    });

    const results = await orchestrator.run({ yes: true });

    expect(results[0]?.status).toBe("error");
    expect(results[0]?.error).toBe("disk full");
  });

  it("returns results that the CLI can inspect to determine non-zero exit", async () => {
    const writer = makeWriter({
      "claude-code": { status: "written" },
      copilot: () => {
        throw new Error("fail");
      },
    });
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("copilot")],
      writer,
    });

    const results = await orchestrator.run({ yes: true });

    expect(results.some((r) => r.status === "error")).toBe(true);
  });
});
