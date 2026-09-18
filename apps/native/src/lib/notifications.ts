import { currentLocale, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation } from "convex/react";
import * as Localization from "expo-localization";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { AppState, Platform } from "react-native";
import {
  createContext,
  createElement,
  use,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { NotificationDeviceSession } from "./notification-device-session";
import { getExpoPushToken } from "./notification-token";
import { analytics } from "./analytics";

const tokenStorageKey = `notification-tokens-${(process.env.EXPO_PUBLIC_CONVEX_URL ?? "default").replace(/[^A-Za-z0-9._-]/g, "_")}`;
const tokenStore = {
  read: async () => {
    const stored = await SecureStore.getItemAsync(tokenStorageKey);
    const tokens: unknown = stored ? JSON.parse(stored) : [];
    if (
      !Array.isArray(tokens) ||
      !tokens.every((token): token is string => typeof token === "string")
    ) {
      throw new Error("Invalid saved notification tokens");
    }
    return tokens;
  },
  write: (tokens: string[]) =>
    SecureStore.setItemAsync(tokenStorageKey, JSON.stringify(tokens)),
};

const NotificationSessionContext =
  createContext<NotificationDeviceSession | null>(null);

export function useNotificationSession() {
  const session = use(NotificationSessionContext);
  if (!session) throw new Error("NotificationSessionProvider is required");
  const operation = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  return { session, operation };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getNotificationTimezone(): string | undefined {
  return (
    Localization.getCalendars()[0]?.timeZone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

export function NotificationSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const locale = useAppLocale();
  const previousLocale = useRef<string | null>(null);
  const { signOut } = useAuthActions();
  const registerDevice = useMutation(api.notifications.registerDevice);
  const unregisterDevice = useMutation(api.notifications.unregisterDevice);
  const setPreferences = useMutation(api.notifications.setPreferences);
  const deleteAccount = useMutation(api.users.deleteCurrentUserAccount);
  const session = useMemo(
    () =>
      new NotificationDeviceSession(tokenStore, {
        getToken: getExpoPushToken,
        getLocale: currentLocale,
        saveToken: (token, locale) =>
          registerDevice({
            token,
            locale,
            platform: Platform.OS === "ios" ? "ios" : "android",
            timezone: getNotificationTimezone(),
          }),
        revokeToken: (token) => unregisterDevice({ token }),
        setWeeklyShelf: (enabled) =>
          setPreferences({
            weeklyShelfEnabled: enabled,
            timezone: getNotificationTimezone(),
          }),
        signOut,
        deleteAccount: () => deleteAccount({}),
        resetAnalytics: analytics.reset,
        reportError: (error) =>
          analytics.captureError("notification_session_cleanup_failed", error),
      }),
    [registerDevice, unregisterDevice, setPreferences, signOut, deleteAccount],
  );
  useEffect(() => {
    if (!isAuthenticated) {
      session.stop();
      return;
    }
    session.start();

    const register = async (
      devicePushToken?: Notifications.DevicePushToken,
    ) => {
      try {
        await session.register(() => getExpoPushToken(false, devicePushToken));
      } catch (error) {
        analytics.captureError("notification_registration_failed", error);
      }
    };

    const tokenListener = Notifications.addPushTokenListener(
      (devicePushToken) => {
        void register(devicePushToken);
      },
    );
    return () => {
      session.stop();
      tokenListener.remove();
    };
  }, [isAuthenticated, session]);

  useEffect(() => {
    if (!isAuthenticated) {
      previousLocale.current = null;
      return;
    }
    const localeChanged =
      previousLocale.current !== null && previousLocale.current !== locale;
    previousLocale.current = locale;
    const register = (event = "notification_registration_failed") => {
      void session
        .register()
        .catch((error) => analytics.captureError(event, error));
    };
    // One initial registration also carries the locale. Retry after returning
    // from Settings or an offline launch without requiring an app restart.
    register(
      localeChanged
        ? "notification_locale_sync_failed"
        : "notification_registration_failed",
    );
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && session.shouldRetryRegistration()) register();
    });
    return () => listener.remove();
  }, [locale, isAuthenticated, session]);

  return createElement(
    NotificationSessionContext,
    { value: session },
    children,
  );
}

function notificationField(
  notification: Notifications.Notification,
  field: string,
): string | null {
  const data = notification.request.content.data as
    | Record<string, unknown>
    | undefined;
  const value = data?.[field];
  return typeof value === "string" ? value : null;
}

export function useNotificationObserver(): void {
  const nav = useRouter();

  useEffect(() => {
    let lastUrl: string | null = null;
    const redirect = (notification: Notifications.Notification) => {
      const url = notificationField(notification, "url");
      if (!url || url === lastUrl) return;
      lastUrl = url;
      // Recorded before navigating: a push that throws must not lose the one
      // signal V1 exists to collect.
      analytics.capture("notification_opened", {
        notification_kind: notificationField(notification, "kind") ?? "unknown",
        notification_id:
          notificationField(notification, "notificationId") ?? "",
      });
      nav.push(url as never);
    };

    const response = Notifications.getLastNotificationResponse();
    if (response?.notification) {
      redirect(response.notification);
    }
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        redirect(response.notification);
      },
    );
    return () => subscription.remove();
  }, [nav]);
}
