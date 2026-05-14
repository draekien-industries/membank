import { describe, expect, it } from "vitest";
import { decideClaim } from "./extraction-policy.js";

describe("decideClaim", () => {
  const inFlight = 10 * 60_000;
  const recent = 60_000;

  it("claims when no record exists", () => {
    expect(decideClaim(undefined, new Date(), inFlight, recent)).toEqual({ kind: "claim" });
  });

  it("skips when an in-flight run is still fresh", () => {
    const startedAt = new Date(Date.now() - 1_000);
    const result = decideClaim(
      { startedAt, completedAt: null, status: "in_flight" },
      new Date(),
      inFlight,
      recent
    );
    expect(result).toEqual({ kind: "skip", reason: "in_flight" });
  });

  it("claims when an in-flight run is stale", () => {
    const startedAt = new Date(Date.now() - inFlight - 1_000);
    const result = decideClaim(
      { startedAt, completedAt: null, status: "in_flight" },
      new Date(),
      inFlight,
      recent
    );
    expect(result).toEqual({ kind: "claim" });
  });

  it("skips when a recent completion exists", () => {
    const completedAt = new Date(Date.now() - 1_000);
    const result = decideClaim(
      { startedAt: completedAt, completedAt, status: "completed" },
      new Date(),
      inFlight,
      recent
    );
    expect(result).toEqual({ kind: "skip", reason: "recently_completed" });
  });

  it("claims when the previous completion is older than the recent window", () => {
    const completedAt = new Date(Date.now() - recent - 1_000);
    const result = decideClaim(
      { startedAt: completedAt, completedAt, status: "completed" },
      new Date(),
      inFlight,
      recent
    );
    expect(result).toEqual({ kind: "claim" });
  });

  it("claims when the previous run failed", () => {
    const startedAt = new Date(Date.now() - 1_000);
    const result = decideClaim(
      { startedAt, completedAt: startedAt, status: "failed" },
      new Date(),
      inFlight,
      recent
    );
    expect(result).toEqual({ kind: "claim" });
  });
});
