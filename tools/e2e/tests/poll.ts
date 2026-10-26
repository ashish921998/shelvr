import { expect } from "e2e";

const TOOL_FAILURE_GRACE_MS = 15_000;

// The runner gives engine failures the "infrastructure" category, possibly on a wrapped cause.
function isToolFailure(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 10; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ((current as { category?: unknown }).category === "infrastructure")
      return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Replaces `expect.poll(check).toBe(true)`, which counts every thrown read as "not yet". */
export async function pollUntil(
  check: () => Promise<boolean>,
  { timeout }: { timeout: number },
): Promise<void> {
  let toolFailure: unknown;
  let failingSince: number | undefined;
  await expect
    .poll(
      async () => {
        try {
          const done = await check();
          failingSince = undefined;
          return done;
        } catch (error) {
          if (!isToolFailure(error)) {
            failingSince = undefined;
            throw error;
          }
          failingSince ??= Date.now();
          if (Date.now() - failingSince < TOOL_FAILURE_GRACE_MS) throw error;
          toolFailure = error;
          return true;
        }
      },
      { timeout },
    )
    .toBe(true);
  if (toolFailure !== undefined) {
    const reason =
      toolFailure instanceof Error ? toolFailure.message : String(toolFailure);
    // The runner retries a plain Error (a test failure) but not an infrastructure failure.
    throw new Error(`The test tool stopped answering: ${reason}`);
  }
}
