import { expect } from "e2e";

const TOOL_FAILURE_STREAK = 2;

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
