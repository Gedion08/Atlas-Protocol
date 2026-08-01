/**
 * Exponential backoff retry with jitter.
 * @param fn - async function to retry
 * @param attempts - total attempts (including first), default 3
 * @param baseDelayMs - base delay before first retry, default 500ms
 * @param maxDelayMs - cap delay, default 4000ms
 * @param isRetryable - optional predicate to classify errors, default retries all
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    isRetryable?: (err: unknown) => boolean;
  } = {},
): Promise<T> {
  const { attempts = 3, baseDelayMs = 500, maxDelayMs = 4_000, isRetryable = () => true } = options;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isRetryable(err)) break;
      const delay = Math.min(baseDelayMs * 2 ** i + Math.random() * 100, maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** Sleeps for ms. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}