import { ConvexError } from "convex/values";

const RETRY_DELAY_MS = 1_000;

type RevokeFailureReason =
  | "convex_error"
  | "network"
  | "not_authenticated"
  | "server_error"
  | "unknown";

export function revokeFailureReason(error: unknown): RevokeFailureReason {
  if (error instanceof ConvexError) return "convex_error";
  if (!(error instanceof Error)) return "unknown";
  if (error.name === "AbortError" || error.message === "Network request failed")
    return "network";
  if (error.message.includes("Not authenticated")) return "not_authenticated";
  if (error.message.includes("Server Error")) return "server_error";
  return "unknown";
}

export async function revokeWithRetry(
  revoke: () => Promise<unknown>,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  try {
    await revoke();
    return;
  } catch {
    await wait(RETRY_DELAY_MS);
  }
  await revoke();
}
