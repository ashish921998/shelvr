import { t } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
// Named imports: expo-notifications 58 ships its enums in files the ESLint
// import plugin cannot parse as modules, so `import/namespace` misses them.
import { AndroidImportance, IosAuthorizationStatus } from "expo-notifications";
import { Platform } from "react-native";

function canReceiveNotifications(
  permission: Notifications.NotificationPermissionsStatus,
) {
  if (Platform.OS !== "ios") return permission.granted;
  const status = permission.ios?.status;
  return (
    status === IosAuthorizationStatus.AUTHORIZED ||
    status === IosAuthorizationStatus.PROVISIONAL ||
    status === IosAuthorizationStatus.EPHEMERAL
  );
}

/** What the user just chose, flattened across the two platforms. Ephemeral
 * authorization counts as granted: it delivers, and no Shelvr build asks for
 * it. */
function permissionOutcome(
  permission: Notifications.NotificationPermissionsStatus,
): "granted" | "provisional" | "denied" {
  if (Platform.OS !== "ios") return permission.granted ? "granted" : "denied";
  if (permission.ios?.status === IosAuthorizationStatus.PROVISIONAL)
    return "provisional";
  return canReceiveNotifications(permission) ? "granted" : "denied";
}

// Android 13 cannot request notification permission before a channel exists.
// Each push kind gets its own channel so Android users can mute one alone.
async function ensureChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("weekly-shelf", {
    name: t("notifications.weeklyShelf"),
    importance: AndroidImportance.DEFAULT,
    vibrationPattern: [0, 150],
  });
  await Notifications.setNotificationChannelAsync("save-reminders", {
    name: t("notifications.remindersChannel"),
    importance: AndroidImportance.DEFAULT,
    vibrationPattern: [0, 150],
  });
}

async function askForPermission(
  permission: Notifications.NotificationPermissionsStatus,
): Promise<boolean> {
  if (canReceiveNotifications(permission)) return true;
  // Once the user has refused for good the OS shows no prompt, so a request
  // would only replay the old denial as if it were a fresh decision.
  if (permission.canAskAgain === false) return false;
  const answer = await Notifications.requestPermissionsAsync();
  analytics.capture("notification_permission_result", {
    outcome: permissionOutcome(answer),
  });
  return canReceiveNotifications(answer);
}

/** Whether a screen asking for notifications has anything left to ask. */
export async function notificationPermissionState(): Promise<
  "granted" | "ask" | "blocked"
> {
  const permission = await Notifications.getPermissionsAsync();
  if (canReceiveNotifications(permission)) return "granted";
  return permission.canAskAgain === false ? "blocked" : "ask";
}

/** Shows the OS prompt when it can still appear. Needs no account. */
export async function requestNotificationPermission(): Promise<boolean> {
  await ensureChannels();
  return askForPermission(await Notifications.getPermissionsAsync());
}

export async function getExpoPushToken(
  requestPermission: boolean,
  devicePushToken?: Notifications.DevicePushToken,
): Promise<string | null> {
  await ensureChannels();
  const permission = await Notifications.getPermissionsAsync();
  const allowed = requestPermission
    ? await askForPermission(permission)
    : canReceiveNotifications(permission);
  if (!allowed) return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Expo project ID is unavailable");
  // Denied permission is the only no-token result. Native configuration and
  // network failures must remain retryable errors, not a false settings prompt.
  return (
    await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken })
  ).data;
}
