import { describe, expect, it } from "vitest";
import { IN_FLIGHT_TIMEOUT_MS, isReclaimableInFlight } from "./debounce-policy.js";

const T0 = Date.parse("2026-09-07T00:00:00.000Z");
const since = new Date(T0).toISOString();

describe("isReclaimableInFlight", () => {
  it("holds the claim until the timeout elapses", () => {
    expect(isReclaimableInFlight(since, T0 + IN_FLIGHT_TIMEOUT_MS - 1)).toBe(false);
  });

  it("releases the claim once the timeout elapses", () => {
    expect(isReclaimableInFlight(since, T0 + IN_FLIGHT_TIMEOUT_MS)).toBe(true);
  });

  it("honours a caller-supplied timeout", () => {
    expect(isReclaimableInFlight(since, T0 + 5_000, 1_000)).toBe(true);
    expect(isReclaimableInFlight(since, T0 + 500, 1_000)).toBe(false);
  });
});
