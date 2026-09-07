export const DEFAULT_DEBOUNCE_MS = 45_000;
export const MAX_BACKOFF_MULTIPLIER = 5;
export const IN_FLIGHT_TIMEOUT_MS = 120_000;

/** True once a claim is old enough that its owner is presumed dead and another may take over. */
export function isReclaimableInFlight(
  inFlightSince: string,
  now = Date.now(),
  timeoutMs = IN_FLIGHT_TIMEOUT_MS
): boolean {
  return now - Date.parse(inFlightSince) >= timeoutMs;
}
