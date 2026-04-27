import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@membank/mcp", () => ({
  startServer: vi.fn().mockResolvedValue(undefined),
}));

const originalArgv = process.argv;

describe("unknown command", () => {
  let exitCode: number | undefined;

  beforeEach(() => {
    exitCode = undefined;
    vi.clearAllMocks();

    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      exitCode = code;
    }) as typeof process.exit;

    return () => {
      process.exit = origExit;
    };
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("prints help and exits with code 1 for an unknown command", async () => {
    process.argv = ["node", "membank", "unknowncommand"];

    const { Command } = await import("commander");
    const program = new Command();
    program.name("membank").description("LLM memory management system");

    let helpPrinted = false;
    const origOutputHelp = program.outputHelp.bind(program);
    program.outputHelp = () => {
      helpPrinted = true;
      origOutputHelp();
    };

    program.on("command:*", () => {
      program.outputHelp();
      process.exit(1);
    });

    program.parse(["node", "membank", "unknowncommand"]);

    expect(helpPrinted).toBe(true);
    expect(exitCode).toBe(1);
  });
});
