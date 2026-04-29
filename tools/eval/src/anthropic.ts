import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

export function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Export it before running the sweep — see tools/eval/README.md."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const HAIKU_MODEL = "claude-haiku-4-5-20251001" as const;
export const JUDGE_MODEL = "claude-sonnet-4-7" as const;

const RETRY_DELAYS_MS = [1000, 3000, 8000, 20000];

export async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const isRetryable =
        status === 408 ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 529;
      const delay = RETRY_DELAYS_MS[attempt];
      if (!isRetryable || delay === undefined) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 250);
      console.warn(`[${label}] retryable error (status=${status}); sleeping ${delay + jitter}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }
  throw lastErr;
}
