import { expect } from "e2e";

/**
 * Test-tool failures in a row that a poll sits through before it stops. One
 * snapshot can time out and the next succeed, but once the tool's daemon has
 * stopped answering, every later read fails the same way (seen on CI: a poll
 * read "Daemon request timed out" for its whole three minutes).
 */
const TOOL_FAILURE_STREAK = 2;

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
 * fail as an assertion. Here the tool's own failure ends the poll at once,
 * after TOOL_FAILURE_STREAK of them in a row, and the error names it.
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
  let streak = 0;
  await expect
    .poll(
      async () => {
        try {
          const done = await check();
          streak = 0;
          return done;
        } catch (error) {
          streak = isToolFailure(error) ? streak + 1 : 0;
          if (streak < TOOL_FAILURE_STREAK) throw error;
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
