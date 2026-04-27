import { describe, expect, it, vi } from "vitest";
import type { HarnessConfigWriter } from "./harness-config-writer.js";
import type { DetectedHarness } from "./harness-detector.js";
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
      detected: [makeHarness("claude-code"), makeHarness("vscode")],
    });
    await orchestrator.run({ yes: true });

    expect(lines.some((l) => l.includes("claude-code"))).toBe(true);
    expect(lines.some((l) => l.includes("vscode"))).toBe(true);
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
      vscode: { status: "written" },
    });
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("vscode")],
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
      detected: [makeHarness("claude-code"), makeHarness("vscode")],
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
      vscode: () => {
        throw new Error("fail");
      },
    });
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("vscode")],
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
    const detectorFn = vi.fn().mockReturnValue([makeHarness("vscode"), makeHarness("codex")]);
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
      vscode: { status: "written" },
    });
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("vscode")],
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
      vscode: () => {
        throw new Error("fail");
      },
    });
    const { orchestrator, lines } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("vscode")],
      writer,
    });

    await orchestrator.run({ yes: true, json: true });

    const parsed = JSON.parse(lines[0] ?? "null") as {
      detectedHarnesses: string[];
      configuredHarnesses: string[];
      modelDownloaded: boolean;
    };
    expect(parsed.detectedHarnesses).toEqual(["claude-code", "vscode"]);
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

// --- AC: partial failure reporting and exit code propagation ---

describe("partial failure reporting", () => {
  it("returns error status for failed harness alongside written status for successful one", async () => {
    const writer = makeWriter({
      "claude-code": { status: "written" },
      vscode: () => {
        throw new Error("permission denied");
      },
    });
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("vscode")],
      writer,
    });

    const results = await orchestrator.run({ yes: true });

    const claudeResult = results.find((r) => r.harness === "claude-code");
    const vscodeResult = results.find((r) => r.harness === "vscode");
    expect(claudeResult?.status).toBe("written");
    expect(vscodeResult?.status).toBe("error");
    expect(vscodeResult?.error).toContain("permission denied");
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
      vscode: () => {
        throw new Error("fail");
      },
    });
    const { orchestrator } = makeOrchestrator({
      detected: [makeHarness("claude-code"), makeHarness("vscode")],
      writer,
    });

    const results = await orchestrator.run({ yes: true });

    expect(results.some((r) => r.status === "error")).toBe(true);
  });
});
