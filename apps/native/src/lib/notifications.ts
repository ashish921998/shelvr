import { t, currentLocale, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation } from "convex/react";
import Constants from "expo-constants";
import * as Localization from "expo-localization";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { Platform } from "react-native";
import {
  createContext,
  createElement,
  use,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { NotificationDeviceSession } from "./notification-device-session";
import { analytics } from "./analytics";
import { syncPendingWeeklyShelfOptIn } from "./pending-notification-preference";

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

async function prepareNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("weekly-shelf", {
    name: t("notifications.weeklyShelf"),
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 150],
  });
}

function allowsNotifications(
  permission: Notifications.NotificationPermissionsStatus,
): boolean {
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function requestNotificationPermission(): Promise<boolean> {
  await prepareNotificationChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (allowsNotifications(existing)) return true;
  return allowsNotifications(await Notifications.requestPermissionsAsync());
}

async function getExpoPushToken(
  requestPermission: boolean,
  devicePushToken?: Notifications.DevicePushToken,
): Promise<string | null> {
  await prepareNotificationChannel();
  const existing = await Notifications.getPermissionsAsync();
  const allowed = requestPermission
    ? await requestNotificationPermission()
    : allowsNotifications(existing);
  if (!allowed) return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;

  try {
    return (
      await Notifications.getExpoPushTokenAsync({
        projectId,
        devicePushToken,
      })
    ).data;
  } catch {
    return null;
  }
}

export function NotificationSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const locale = useAppLocale();
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

    const syncPendingPreference = async () => {
      try {
        await syncPendingWeeklyShelfOptIn(() => session.setWeeklyShelf(true));
      } catch (error) {
        analytics.captureError("notification_preference_sync_failed", error);
      }
    };

    const register = async (
      devicePushToken?: Notifications.DevicePushToken,
    ) => {
      try {
        await session.register(() => getExpoPushToken(false, devicePushToken));
      } catch (error) {
        analytics.captureError("notification_registration_failed", error);
      }
    };

    void syncPendingPreference();
    void register();
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
    if (!isAuthenticated) return;
    void session
      .register()
      .catch((error) =>
        analytics.captureError("notification_locale_sync_failed", error),
      );
  }, [locale, isAuthenticated, session]);

  return createElement(
    NotificationSessionContext,
    { value: session },
    children,
  );
}

function getNotificationUrl(
  notification: Notifications.Notification,
): string | null {
  const data = notification.request.content.data as
    | { url?: unknown }
    | undefined;
  return typeof data?.url === "string" ? data.url : null;
}

export function useNotificationObserver(): void {
  const nav = useRouter();

  useEffect(() => {
    let lastUrl: string | null = null;
    const redirect = (notification: Notifications.Notification) => {
      const url = getNotificationUrl(notification);
      if (!url || url === lastUrl) return;
      lastUrl = url;
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
