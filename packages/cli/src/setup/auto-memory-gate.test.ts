import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigManager } from "../config/index.js";
import { ClaudeAutoMemoryGate } from "./auto-memory-gate.js";
import type { AutoMemorySettings } from "./claude-settings.js";

vi.mock("../config/index.js", () => ({
  ConfigManager: { get: vi.fn(), set: vi.fn() },
}));

function fakeSettings(status: "enabled" | "disabled"): AutoMemorySettings & {
  disableAutoMemory: ReturnType<typeof vi.fn>;
} {
  return {
    path: "/home/w/.claude/settings.json",
    autoMemoryStatus: () => status,
    disableAutoMemory: vi.fn(),
  };
}

const swallow = (): void => {};

describe("ClaudeAutoMemoryGate", () => {
  beforeEach(() => {
    vi.mocked(ConfigManager.get).mockReturnValue(undefined);
    vi.mocked(ConfigManager.set).mockClear();
  });

  it("reports no conflict when native auto-memory is already off", async () => {
    const settings = fakeSettings("disabled");
    const prompter = vi.fn();

    const outcome = await new ClaudeAutoMemoryGate({ settings, prompter }).run({
      interactive: true,
      out: swallow,
    });

    expect(outcome).toBe("none");
    expect(prompter).not.toHaveBeenCalled();
  });

  it("reports without prompting or writing when non-interactive", async () => {
    const settings = fakeSettings("enabled");
    const prompter = vi.fn();

    const outcome = await new ClaudeAutoMemoryGate({ settings, prompter }).run({
      interactive: false,
      out: swallow,
    });

    expect(outcome).toBe("reported");
    expect(prompter).not.toHaveBeenCalled();
    expect(settings.disableAutoMemory).not.toHaveBeenCalled();
  });

  it("disables when the user confirms", async () => {
    const settings = fakeSettings("enabled");
    const prompter = vi.fn().mockResolvedValue(true);

    const outcome = await new ClaudeAutoMemoryGate({ settings, prompter }).run({
      interactive: true,
      out: swallow,
    });

    expect(outcome).toBe("disabled");
    expect(settings.disableAutoMemory).toHaveBeenCalledOnce();
  });

  it("remembers a decline so it is not asked again", async () => {
    const settings = fakeSettings("enabled");
    const prompter = vi.fn().mockResolvedValue(false);

    const outcome = await new ClaudeAutoMemoryGate({ settings, prompter }).run({
      interactive: true,
      out: swallow,
    });

    expect(outcome).toBe("reported");
    expect(settings.disableAutoMemory).not.toHaveBeenCalled();
    expect(ConfigManager.set).toHaveBeenCalledWith("setup.autoMemoryPromptDismissed", true);
  });

  it("stays silent once dismissed", async () => {
    vi.mocked(ConfigManager.get).mockReturnValue(true);
    const settings = fakeSettings("enabled");
    const prompter = vi.fn();

    const outcome = await new ClaudeAutoMemoryGate({ settings, prompter }).run({
      interactive: true,
      out: swallow,
    });

    expect(outcome).toBe("none");
    expect(prompter).not.toHaveBeenCalled();
  });
});
