import * as Updates from "expo-updates";
import { useCallback, useRef, useState } from "react";
import { analytics } from "@/lib/analytics";

/**
 * One state for the manual EAS Update check in Profile. Everything the card
 * shows is a function of this value, so contradictory copy ("ready" beside
 * "couldn't restart", or "latest" beside "ready") cannot be rendered.
 */
export type UpdateState =
  | { kind: "unsupported"; reason: "development" | "disabled" }
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading" }
  | { kind: "upToDate" }
  | { kind: "ready" }
  | { kind: "restarting" }
  | { kind: "failed"; at: "check" | "restart" };

/** What the last user action ended in. Cleared when the next one starts. */
type UpdateOutcome = "upToDate" | "checkFailed" | "restartFailed" | null;

export type UpdateSignals = {
  /** Why manual updates can't run here, or null when they can. */
  unsupported: "development" | "disabled" | null;
  acting: "check" | "restart" | null;
  isChecking: boolean;
  isDownloading: boolean;
  isUpdatePending: boolean;
  outcome: UpdateOutcome;
};

/** Pure: the native flags and the last outcome, folded into one state. */
export function deriveUpdateState(signals: UpdateSignals): UpdateState {
  if (signals.unsupported) {
    return { kind: "unsupported", reason: signals.unsupported };
  }
  if (signals.acting === "restart") return { kind: "restarting" };
  if (signals.isDownloading) return { kind: "downloading" };
  if (signals.isChecking || signals.acting === "check") {
    return { kind: "checking" };
  }
  if (signals.isUpdatePending) {
    // A failed reload leaves the update pending; say what failed, once.
    return signals.outcome === "restartFailed"
      ? { kind: "failed", at: "restart" }
      : { kind: "ready" };
  }
  // A background download that lands after "latest" wins above, so the
  // up-to-date note can never sit beside "ready".
  if (signals.outcome === "checkFailed") return { kind: "failed", at: "check" };
  if (signals.outcome === "upToDate") return { kind: "upToDate" };
  return { kind: "idle" };
}

type UpdatesApi = Pick<
  typeof Updates,
  "checkForUpdateAsync" | "fetchUpdateAsync"
>;

/**
 * Checks the build's channel and downloads what it finds. A rollback
 * directive arrives as `isAvailable: false, isRollBackToEmbedded: true` and
 * still needs `fetchUpdateAsync()` to apply.
 */
export async function checkAndFetch(
  api: UpdatesApi = Updates,
): Promise<"upToDate" | "fetched"> {
  const result = await api.checkForUpdateAsync();
  if (!result.isAvailable && !result.isRollBackToEmbedded) return "upToDate";
  const fetched = await api.fetchUpdateAsync();
  return fetched.isNew || fetched.isRollBackToEmbedded ? "fetched" : "upToDate";
}

// In a debug build JS comes from Metro even when expo-updates is compiled in,
// and check/reload reject there. A release build can also have updates
// switched off, which is not a development build and should not say so.
const unsupported: UpdateSignals["unsupported"] = __DEV__
  ? "development"
  : Updates.isEnabled
    ? null
    : "disabled";

/** The reload screen's colors, so a restart doesn't flash the default white. */
export function useAppUpdate(backgroundColor: string, spinnerColor: string) {
  const { currentlyRunning, isChecking, isDownloading, isUpdatePending } =
    Updates.useUpdates();
  const [acting, setActing] = useState<"check" | "restart" | null>(null);
  const [outcome, setOutcome] = useState<UpdateOutcome>(null);
  // The native flags and React state land a render late, so two taps in one
  // frame would both pass a state check. The ref makes the second a no-op.
  const lock = useRef(false);

  const state = deriveUpdateState({
    unsupported,
    acting,
    isChecking,
    isDownloading,
    isUpdatePending,
    outcome,
  });

  const act = useCallback(async () => {
    if (unsupported || lock.current) return;
    lock.current = true;
    setOutcome(null);
    if (isUpdatePending) {
      setActing("restart");
      try {
        await Updates.reloadAsync({
          reloadScreenOptions: {
            backgroundColor,
            spinner: { color: spinnerColor },
          },
        });
        // Success reloads the JS runtime; nothing below runs, and the lock
        // stays held so the reload is never requested twice.
      } catch (error) {
        analytics.captureError("update_restart_failed", error);
        setOutcome("restartFailed");
        setActing(null);
        lock.current = false;
      }
      return;
    }
    setActing("check");
    try {
      const result = await checkAndFetch();
      if (result === "upToDate") setOutcome("upToDate");
    } catch (error) {
      analytics.captureError("update_check_failed", error);
      setOutcome("checkFailed");
    } finally {
      setActing(null);
      lock.current = false;
    }
  }, [isUpdatePending, backgroundColor, spinnerColor]);

  const runningSince =
    currentlyRunning.isEmbeddedLaunch || !currentlyRunning.createdAt
      ? null
      : currentlyRunning.createdAt.getTime();

  return { state, act, runningSince };
}
