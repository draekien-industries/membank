import { createProjectRepository, DatabaseManager } from "@membank/core";
import { seedExtractionRun, seedSynthesis } from "@membank/core/test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Formatter } from "../formatter.js";
import { PromptHelper } from "../prompt-helper.js";
import { doctorCommand } from "./doctor.js";

const autoMemoryStatus = vi.fn(() => "disabled");
const disableAutoMemory = vi.fn();

vi.mock("../setup/claude-settings.js", () => ({
  ClaudeSettings: class {
    readonly path = "/tmp/settings.json";
    autoMemoryStatus(): string {
      return autoMemoryStatus();
    }
    disableAutoMemory(): void {
      disableAutoMemory();
    }
  },
}));

interface DoctorOutput {
  checks: Array<{ id: string; status: string; summary: string; fixed: boolean }>;
}

function prompterAnswering(answer: boolean): PromptHelper {
  const prompt = new PromptHelper(false);
  prompt.confirm = async () => answer;
  return prompt;
}

async function runDoctor(opts: { fix?: boolean }, answer = true): Promise<DoctorOutput> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  try {
    await doctorCommand(opts, new Formatter(true), prompterAnswering(answer));
  } finally {
    process.stdout.write = original;
  }
  return JSON.parse(chunks.join("")) as DoctorOutput;
}

function check(output: DoctorOutput, id: string): DoctorOutput["checks"][number] {
  const found = output.checks.find((c) => c.id === id);
  if (found === undefined) throw new Error(`missing check: ${id}`);
  return found;
}

describe("doctor command", () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = DatabaseManager.openInMemory();
    vi.spyOn(DatabaseManager, "open").mockReturnValue(db);
    vi.spyOn(db, "close").mockImplementation(() => {});
    autoMemoryStatus.mockReturnValue("disabled");
    disableAutoMemory.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports all clear on a healthy install", async () => {
    const output = await runDoctor({});

    expect(output.checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("warns about native auto-memory without writing when --fix is absent", async () => {
    autoMemoryStatus.mockReturnValue("enabled");

    const output = await runDoctor({});

    expect(check(output, "auto-memory").status).toBe("warn");
    expect(disableAutoMemory).not.toHaveBeenCalled();
  });

  it("disables native auto-memory under --fix", async () => {
    autoMemoryStatus.mockReturnValue("enabled");

    const output = await runDoctor({ fix: true });

    expect(check(output, "auto-memory").fixed).toBe(true);
    expect(disableAutoMemory).toHaveBeenCalledOnce();
  });

  it("detects stuck in-flight runs and reaps them under --fix", async () => {
    seedExtractionRun(db, { sessionId: "dead", startedAt: "2020-01-01T00:00:00.000Z" });

    const detected = await runDoctor({});
    expect(check(detected, "stale-runs").status).toBe("warn");
    expect(check(detected, "stale-runs").summary).toContain("1 extraction run");

    const fixed = await runDoctor({ fix: true });
    expect(check(fixed, "stale-runs").fixed).toBe(true);

    const after = await runDoctor({});
    expect(check(after, "stale-runs").status).toBe("ok");
  });

  it("detects a synthesis stuck in flight and clears it under --fix", async () => {
    seedSynthesis(db, { memoryType: "preference", inFlightSince: "2020-01-01T00:00:00.000Z" });

    const detected = await runDoctor({});
    expect(check(detected, "stale-syntheses").status).toBe("warn");
    expect(check(detected, "stale-syntheses").summary).toContain("1 synthesis");

    const fixed = await runDoctor({ fix: true });
    expect(check(fixed, "stale-syntheses").fixed).toBe(true);

    const after = await runDoctor({});
    expect(check(after, "stale-syntheses").status).toBe("ok");
  });

  it("leaves a synthesis alone while its claim is still within the timeout", async () => {
    seedSynthesis(db, { memoryType: "preference", inFlightSince: new Date().toISOString() });

    const output = await runDoctor({});

    expect(check(output, "stale-syntheses").status).toBe("ok");
  });

  it("detects a split project scope and merges it under --fix", async () => {
    const projects = createProjectRepository(db);
    projects.upsertByHash("1111111111111111", "dia", "F:/Dev/dia");
    projects.upsertByHash("2222222222222222", "dia", "git@github.com:acme/dia.git");

    const detected = await runDoctor({});
    expect(check(detected, "split-scope").status).toBe("warn");

    const fixed = await runDoctor({ fix: true });
    expect(check(fixed, "split-scope").fixed).toBe(true);
    expect(projects.getByHash("1111111111111111")).toBeUndefined();

    const after = await runDoctor({});
    expect(check(after, "split-scope").status).toBe("ok");
  });

  it("leaves the split alone when the merge prompt is declined", async () => {
    const projects = createProjectRepository(db);
    projects.upsertByHash("1111111111111111", "dia", "F:/Dev/dia");
    projects.upsertByHash("2222222222222222", "dia", "git@github.com:acme/dia.git");

    const output = await runDoctor({ fix: true }, false);

    expect(check(output, "split-scope").fixed).toBe(false);
    expect(projects.getByHash("1111111111111111")).toBeDefined();
  });

  it("warns when the extraction failure rate is above the threshold", async () => {
    const now = new Date().toISOString();
    seedExtractionRun(db, {
      sessionId: "ok-1",
      startedAt: now,
      completedAt: now,
      status: "completed",
    });
    seedExtractionRun(db, {
      sessionId: "bad-1",
      startedAt: now,
      completedAt: now,
      status: "failed",
      error: "ENOENT",
    });

    const output = await runDoctor({});

    const failures = check(output, "extraction-failures");
    expect(failures.status).toBe("warn");
    expect(failures.summary).toContain("1/2");
  });
});
