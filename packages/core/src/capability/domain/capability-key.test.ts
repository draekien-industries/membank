import { describe, expect, it } from "vitest";
import { CapabilityKey } from "./capability-key.js";

describe("CapabilityKey", () => {
  describe("forTool / forSkill", () => {
    it("builds a tool key", () => {
      const key = CapabilityKey.forTool("Bash");
      expect(key.kind).toBe("tool");
      expect(key.name).toBe("Bash");
      expect(key.toString()).toBe("tool:Bash");
    });

    it("builds a skill key", () => {
      const key = CapabilityKey.forSkill("simplify");
      expect(key.kind).toBe("skill");
      expect(key.toString()).toBe("skill:simplify");
    });

    it("trims surrounding whitespace from the name", () => {
      expect(CapabilityKey.forTool("  Bash  ").name).toBe("Bash");
    });

    it("rejects empty or whitespace-only names", () => {
      expect(() => CapabilityKey.forTool("")).toThrow();
      expect(() => CapabilityKey.forSkill("   ")).toThrow();
    });
  });

  describe("parse", () => {
    it("parses a valid tool key", () => {
      const key = CapabilityKey.parse("tool:Bash");
      expect(key.kind).toBe("tool");
      expect(key.name).toBe("Bash");
    });

    it("parses a valid skill key", () => {
      const key = CapabilityKey.parse("skill:simplify");
      expect(key.kind).toBe("skill");
      expect(key.name).toBe("simplify");
    });

    it("splits on the first colon, preserving colons in the name", () => {
      const key = CapabilityKey.parse("tool:mcp__server:method");
      expect(key.kind).toBe("tool");
      expect(key.name).toBe("mcp__server:method");
    });

    it("throws when there is no prefix separator", () => {
      expect(() => CapabilityKey.parse("Bash")).toThrow(/expected "tool:<name>"/);
    });

    it("throws on an unknown prefix", () => {
      expect(() => CapabilityKey.parse("global:Bash")).toThrow(/prefix must be/);
    });

    it("throws on an empty name", () => {
      expect(() => CapabilityKey.parse("tool:")).toThrow(/must not be empty/);
      expect(() => CapabilityKey.parse("tool:   ")).toThrow(/must not be empty/);
    });

    it("rejects reserved scope words as names", () => {
      expect(() => CapabilityKey.parse("tool:current")).toThrow(/reserved scope word/);
      expect(() => CapabilityKey.parse("skill:global")).toThrow(/reserved scope word/);
      expect(() => CapabilityKey.parse("tool:all")).toThrow(/reserved scope word/);
    });
  });
});
