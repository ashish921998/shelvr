import { saveErrorCode } from "@convex/model/saveErrors";
import type { AppIntentInvocation } from "expo-app-intents";

const SAVE_NAMES = new Set(["saveNote", "saveLink", "saveImages"]);

export function isSaveInvocation(invocation: AppIntentInvocation): boolean {
  return SAVE_NAMES.has(invocation.name);
}

type DrainDeps = {
  entitled: boolean;
  inFlight: Set<string>;
  handle: (invocation: AppIntentInvocation) => Promise<void>;
  remove: (id: string) => Promise<void>;
  report: (invocation: AppIntentInvocation, error: unknown) => void;
};

export async function drainInvocations(
  pending: AppIntentInvocation[],
  { entitled, inFlight, handle, remove, report }: DrainDeps,
): Promise<void> {
  for (const invocation of pending) {
    if (inFlight.has(invocation.id)) continue;
    if (!entitled && isSaveInvocation(invocation)) continue;
    inFlight.add(invocation.id);
    try {
      await handle(invocation);
      await remove(invocation.id);
    } catch (error) {
      const code = saveErrorCode(error);
      if (code === null) report(invocation, error);
      else if (code !== "pro_required") await remove(invocation.id);
    } finally {
      inFlight.delete(invocation.id);
    }
  }
}
