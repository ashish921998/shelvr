import { expect } from "e2e";

/**
 * How long a poll keeps reading through test-tool failures before it stops.
 * Once the tool's daemon has stopped answering, every later read fails the
 * same way (seen on CI: a poll read "Daemon request timed out" for its whole
 * three minutes). But a slow runner also overruns its watchdog on the first
 * read after a cold relaunch and answers again a few seconds later, and two
 * failures in a row, a poll backoff apart, failed the onboarding flow there
 * (CI run 39603459162). So the failures have to last this long.
 */
const TOOL_FAILURE_GRACE_MS = 15_000;

/**
 * True when the test tool failed rather than the app: the runner gives an
 * engine failure such as a timed-out daemon request the `infrastructure`
 * category, and a missing or wrong control the `test` category. It may sit
 * under a wrapping error, so the cause chain is searched.
 */
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

/**
 * Calls `check` until it returns true, like `expect.poll(check).toBe(true)`.
 * `expect.poll` treats every thrown read as "not yet", so a test tool that
 * stopped answering used to keep a poll going until its timeout and then
 * fail as an assertion. Here the tool's own failure ends the poll once it
 * has lasted TOOL_FAILURE_GRACE_MS with no good read, and the error names it.
 *
 * It is thrown as a plain error, which the runner counts as a test failure:
 * on CI it retries a test only for those, and a retry starts from a fresh
 * launch that often gets past a stalled tool.
 */
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
    throw new Error(`The test tool stopped answering: ${reason}`);
  }
}
