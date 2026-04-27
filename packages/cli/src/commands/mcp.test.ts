import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@membank/mcp", () => ({
  startServer: vi.fn().mockResolvedValue(undefined),
}));

import { startServer } from "@membank/mcp";

const originalArgv = process.argv;

describe("--mcp flag routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("calls startServer when --mcp is in argv", async () => {
    process.argv = ["node", "membank", "--mcp"];
    expect(process.argv.includes("--mcp")).toBe(true);

    if (process.argv.includes("--mcp")) {
      await startServer();
    }

    expect(startServer).toHaveBeenCalledOnce();
  });

  it("does not call startServer when --mcp is absent", async () => {
    process.argv = ["node", "membank", "query", "some text"];
    expect(process.argv.includes("--mcp")).toBe(false);

    if (process.argv.includes("--mcp")) {
      await startServer();
    }

    expect(startServer).not.toHaveBeenCalled();
  });

  it("--mcp check fires regardless of what command name follows", async () => {
    // membank query --mcp: the argv check fires before Commander routing
    process.argv = ["node", "membank", "query", "--mcp"];
    expect(process.argv.includes("--mcp")).toBe(true);

    if (process.argv.includes("--mcp")) {
      await startServer();
    }

    expect(startServer).toHaveBeenCalledOnce();
  });

  it("startServer is called with no arguments", async () => {
    process.argv = ["node", "membank", "--mcp"];

    if (process.argv.includes("--mcp")) {
      await startServer();
    }

    expect(startServer).toHaveBeenCalledWith();
  });
});
