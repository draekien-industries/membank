import { describe, expect, it } from "vitest";
import { parseQueryScope, parseSaveScope } from "./server.js";

describe("parseSaveScope", () => {
  it("'global' returns the global target", async () => {
    await expect(parseSaveScope("global")).resolves.toEqual({ tag: "global" });
  });

  it("'current' resolves to a project target", async () => {
    const target = await parseSaveScope("current");
    expect(target.tag).toBe("project");
  });

  it("undefined defaults to a project target", async () => {
    const target = await parseSaveScope(undefined);
    expect(target.tag).toBe("project");
  });

  it("'tool:Bash' returns a capability target", async () => {
    const target = await parseSaveScope("tool:Bash");
    expect(target.tag).toBe("capability");
    if (target.tag !== "capability") throw new Error("unreachable");
    expect(target.key.kind).toBe("tool");
    expect(target.key.name).toBe("Bash");
  });

  it("'skill:x' returns a capability target", async () => {
    const target = await parseSaveScope("skill:x");
    expect(target.tag).toBe("capability");
    if (target.tag !== "capability") throw new Error("unreachable");
    expect(target.key.kind).toBe("skill");
    expect(target.key.name).toBe("x");
  });

  it("rejects an empty capability name", async () => {
    await expect(parseSaveScope("tool:")).rejects.toThrow();
  });

  it("rejects an unprefixed scope word", async () => {
    await expect(parseSaveScope("bogus")).rejects.toThrow();
  });
});

describe("parseQueryScope", () => {
  it("'global' returns the global scope", async () => {
    await expect(parseQueryScope("global")).resolves.toEqual({ tag: "global" });
  });

  it("'all' returns the all scope", async () => {
    await expect(parseQueryScope("all")).resolves.toEqual({ tag: "all" });
  });

  it("'current' resolves to a current scope with a project hash", async () => {
    const scope = await parseQueryScope("current");
    expect(scope.tag).toBe("current");
    if (scope.tag !== "current") throw new Error("unreachable");
    expect(typeof scope.projectHash).toBe("string");
  });

  it("undefined defaults to a current scope", async () => {
    const scope = await parseQueryScope(undefined);
    expect(scope.tag).toBe("current");
  });

  it("'tool:Bash' returns a capability scope", async () => {
    const scope = await parseQueryScope("tool:Bash");
    expect(scope.tag).toBe("capability");
    if (scope.tag !== "capability") throw new Error("unreachable");
    expect(scope.key.toString()).toBe("tool:Bash");
  });

  it("rejects an empty capability name", async () => {
    await expect(parseQueryScope("tool:")).rejects.toThrow();
  });

  it("rejects an unprefixed scope word", async () => {
    await expect(parseQueryScope("bogus")).rejects.toThrow();
  });
});
