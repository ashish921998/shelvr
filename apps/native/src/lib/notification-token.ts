import { t } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

function canReceiveNotifications(
  permission: Notifications.NotificationPermissionsStatus,
) {
  if (Platform.OS !== "ios") return permission.granted;
  const status = permission.ios?.status;
  return (
    status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

/** What the user just chose, flattened across the two platforms. Ephemeral
 * authorization counts as granted: it delivers, and no Shelvr build asks for
 * it. */
function permissionOutcome(
  permission: Notifications.NotificationPermissionsStatus,
): "granted" | "provisional" | "denied" {
  if (Platform.OS !== "ios") return permission.granted ? "granted" : "denied";
  if (
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  )
    return "provisional";
  return canReceiveNotifications(permission) ? "granted" : "denied";
}

export async function getExpoPushToken(
  requestPermission: boolean,
  devicePushToken?: Notifications.DevicePushToken,
): Promise<string | null> {
  // Android 13 cannot request notification permission before a channel exists.
  // Each push kind gets its own channel so Android users can mute one alone.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("weekly-shelf", {
      name: t("notifications.weeklyShelf"),
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 150],
    });
    await Notifications.setNotificationChannelAsync("save-reminders", {
      name: t("notifications.remindersChannel"),
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 150],
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  // Once the user has refused for good the OS shows no prompt, so a request
  // would only replay the old denial as if it were a fresh decision.
  if (permission.canAskAgain === false && !canReceiveNotifications(permission))
    return null;
  if (!canReceiveNotifications(permission) && requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
    analytics.capture("notification_permission_result", {
      outcome: permissionOutcome(permission),
    });
  }
  if (!canReceiveNotifications(permission)) return null;

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
