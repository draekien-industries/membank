import { describe, expect, it } from "vitest";
import { PromptHelper } from "./prompt-helper.js";

describe("PromptHelper — autoConfirm: true", () => {
  it("confirm returns true immediately without prompting", async () => {
    const helper = new PromptHelper(true);
    const result = await helper.confirm("Delete this?");
    expect(result).toBe(true);
  });

  it("confirm resolves synchronously (no stdin interaction)", async () => {
    const helper = new PromptHelper(true);
    let resolved = false;
    const p = helper.confirm("Are you sure?").then((v) => {
      resolved = true;
      return v;
    });
    await p;
    expect(resolved).toBe(true);
  });
});
