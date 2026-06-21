import type { CapabilityKind } from "../../schemas.js";

const RESERVED_NAMES = new Set(["current", "global", "all"]);

export class CapabilityKey {
  readonly #kind: CapabilityKind;
  readonly #name: string;

  private constructor(kind: CapabilityKind, name: string) {
    this.#kind = kind;
    this.#name = name;
    Object.freeze(this);
  }

  static forTool(name: string): CapabilityKey {
    return CapabilityKey.#of("tool", name);
  }

  static forSkill(name: string): CapabilityKey {
    return CapabilityKey.#of("skill", name);
  }

  static parse(raw: string): CapabilityKey {
    const separator = raw.indexOf(":");
    if (separator === -1) {
      throw new Error(`Invalid capability key "${raw}": expected "tool:<name>" or "skill:<name>"`);
    }
    const prefix = raw.slice(0, separator);
    const name = raw.slice(separator + 1);
    if (prefix !== "tool" && prefix !== "skill") {
      throw new Error(
        `Invalid capability key "${raw}": prefix must be "tool" or "skill", got "${prefix}"`
      );
    }
    return CapabilityKey.#of(prefix, name);
  }

  static #of(kind: CapabilityKind, name: string): CapabilityKey {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error(`Invalid ${kind} capability key: name must not be empty`);
    }
    if (RESERVED_NAMES.has(trimmed)) {
      throw new Error(
        `Invalid ${kind} capability key: "${trimmed}" is a reserved scope word (${[...RESERVED_NAMES].join(", ")})`
      );
    }
    return new CapabilityKey(kind, trimmed);
  }

  get kind(): CapabilityKind {
    return this.#kind;
  }

  get name(): string {
    return this.#name;
  }

  toString(): string {
    return `${this.#kind}:${this.#name}`;
  }
}
