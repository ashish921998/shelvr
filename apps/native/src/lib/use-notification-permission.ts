import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { analytics } from "./analytics";
import { notificationPermissionState } from "./notification-token";

type PermissionState = Awaited<ReturnType<typeof notificationPermissionState>>;

/**
 * The device's notification permission, read again whenever the app comes
 * back to the foreground (the user may have changed it in iOS Settings).
 * Undefined until the first read answers.
 */
export function useNotificationPermission(): PermissionState | undefined {
  const [state, setState] = useState<PermissionState>();

  useEffect(() => {
    let live = true;
    // An earlier read can answer after a later one; only the latest may land.
    let latest = 0;
    const read = () => {
      const id = ++latest;
      notificationPermissionState().then(
        (next) => {
          if (live && id === latest) setState(next);
        },
        (error: unknown) => {
          analytics.captureError("notification_permission_read_failed", error);
        },
      );
    };
    read();
    const listener = AppState.addEventListener("change", (appState) => {
      if (appState === "active") read();
    });
    return () => {
      live = false;
      listener.remove();
    };
  }, []);

  return state;
}
