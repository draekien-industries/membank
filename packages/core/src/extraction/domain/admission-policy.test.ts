import { describe, expect, it } from "vitest";
import {
  ACTIONABILITY_VALUES,
  type Actionability,
  type AdmissionDecision,
  DERIVABILITY_VALUES,
  type Derivability,
  DURABILITY_VALUES,
  type Durability,
  decideAdmission,
  type MemoryCandidate,
} from "./admission-policy.js";

function candidate(
  durability: Durability,
  derivability: Derivability,
  actionability: Actionability,
  evidence = "the user said so"
): MemoryCandidate {
  return { content: "c", type: "learning", durability, derivability, actionability, evidence };
}

function expected(durability: Durability, derivability: Derivability): AdmissionDecision {
  if (durability === "volatile") return { kind: "reject", clause: "volatile" };
  if (derivability === "trivial") return { kind: "reject", clause: "trivially-derivable" };
  return { kind: "admit" };
}

describe("decideAdmission", () => {
  it("covers the full 3x3x3 combination space", () => {
    for (const durability of DURABILITY_VALUES) {
      for (const derivability of DERIVABILITY_VALUES) {
        for (const actionability of ACTIONABILITY_VALUES) {
          expect(decideAdmission(candidate(durability, derivability, actionability))).toEqual(
            expected(durability, derivability)
          );
        }
      }
    }
  });

  it("rejects as ungrounded ahead of every other clause", () => {
    for (const evidence of ["", "   ", "\n"]) {
      expect(decideAdmission(candidate("volatile", "trivial", "context", evidence))).toEqual({
        kind: "reject",
        clause: "ungrounded",
      });
    }
  });

  it("admits only when all three tests pass", () => {
    expect(decideAdmission(candidate("permanent", "hidden", "directive"))).toEqual({
      kind: "admit",
    });
  });

  it("admits durable, non-derivable context: synthesis injects it without the session asking", () => {
    for (const derivability of ["hidden", "costly"] as const) {
      for (const durability of ["permanent", "stable"] as const) {
        expect(decideAdmission(candidate(durability, derivability, "context"))).toEqual({
          kind: "admit",
        });
      }
    }
  });
});

// The acceptance criteria for the gate: the worked examples in
// docs/designs/memory-quality-criteria.md must land on their stated verdicts.
describe("worked examples from the audited corpus", () => {
  const examples: Array<{
    content: string;
    rubric: [Durability, Derivability, Actionability];
    verdict: AdmissionDecision;
  }> = [
    {
      content: "Postgres GUC placeholders reset to '' not NULL on a pooled connection",
      rubric: ["permanent", "hidden", "constraint"],
      verdict: { kind: "admit" },
    },
    {
      content: "ASPIRE_CONTAINER_RUNTIME=podman — no config-file key exists for this",
      rubric: ["permanent", "costly", "directive"],
      verdict: { kind: "admit" },
    },
    {
      content: "Always use conventional commit format",
      rubric: ["stable", "hidden", "directive"],
      verdict: { kind: "admit" },
    },
    {
      content: "Biome 2.x is the linter for membank; replaced ESLint + Prettier",
      rubric: ["stable", "trivial", "context"],
      verdict: { kind: "reject", clause: "trivially-derivable" },
    },
    {
      content: "Memory type coloring uses CVA via @/lib/typeColors.ts",
      rubric: ["stable", "trivial", "context"],
      verdict: { kind: "reject", clause: "trivially-derivable" },
    },
    {
      content: "@workspace/otel-* packages follow the source-only pattern, no dist/",
      rubric: ["stable", "trivial", "context"],
      verdict: { kind: "reject", clause: "trivially-derivable" },
    },
  ];

  for (const example of examples) {
    it(example.content, () => {
      const [durability, derivability, actionability] = example.rubric;
      expect(decideAdmission(candidate(durability, derivability, actionability))).toEqual(
        example.verdict
      );
    });
  }
});
