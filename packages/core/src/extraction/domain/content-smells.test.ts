import { describe, expect, it } from "vitest";
import { detectContentSmells } from "./content-smells.js";

describe("detectContentSmells", () => {
  it("flags a file path", () => {
    expect(detectContentSmells("Memory type coloring uses CVA via @/lib/typeColors.ts")).toContain(
      "code-reference"
    );
    expect(detectContentSmells("Config lives in src/config/manager")).toContain("code-reference");
  });

  it("flags completed-action phrasing", () => {
    expect(detectContentSmells("Fixed the scope resolver to use the remote hash")).toContain(
      "completed-action"
    );
  });

  it("flags session deixis", () => {
    expect(detectContentSmells("Use the stub for now")).toContain("session-deixis");
  });

  it("returns nothing for a durable, non-derivable learning", () => {
    expect(
      detectContentSmells(
        "Postgres GUC placeholders reset to an empty string rather than NULL on a pooled connection"
      )
    ).toEqual([]);
  });

  it("reports every smell present", () => {
    expect(detectContentSmells("For now we fixed src/app.ts")).toEqual([
      "code-reference",
      "completed-action",
      "session-deixis",
    ]);
  });
});
