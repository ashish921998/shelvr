import { api } from '@convex/_generated/api';
import { useConvexAuth, useMutation } from 'convex/react';
import Constants from 'expo-constants';
import * as Localization from 'expo-localization';
import * as Notifications from 'expo-notifications';
import { router, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function getNotificationTimezone(): string | undefined {
  return Localization.getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function prepareNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('weekly-shelf', {
    name: 'Weekly shelf',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 150],
  });
}

export async function getExpoPushToken(
  requestPermission: boolean,
  devicePushToken?: Notifications.DevicePushToken,
): Promise<string | null> {
  await prepareNotificationChannel();
  const existing = await Notifications.getPermissionsAsync();
  let permission = existing;
  if (!permission.granted && requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
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

export function PushNotificationSetup() {
  const { isAuthenticated } = useConvexAuth();
  const registerDevice = useMutation(api.notifications.registerDevice);
  // Auth resolution can flip several times during boot, re-running this effect
  // each flip. A per-run guard would reset every time and re-register the same
  // token dozens of times in the first seconds, so keep the last registered
  // token in a ref (survives effect re-runs). Sign-out clears it so a
  // different account re-registers the same device token.
  const lastRegisteredToken = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      lastRegisteredToken.current = null;
      return;
    }
    let cancelled = false;

    const register = async (devicePushToken?: Notifications.DevicePushToken) => {
      const token = await getExpoPushToken(false, devicePushToken);
      if (!token || cancelled || token === lastRegisteredToken.current) return;
      try {
        await registerDevice({
          token,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          timezone: getNotificationTimezone(),
        });
        lastRegisteredToken.current = token;
      } catch {
        // Leave `lastRegisteredToken` unset so a later token event retries.
      }
    };

    void register();
    const tokenListener = Notifications.addPushTokenListener((devicePushToken) => {
      void register(devicePushToken);
    });
    return () => {
      cancelled = true;
      tokenListener.remove();
    };
  }, [isAuthenticated, registerDevice]);

  return null;
}

function getNotificationUrl(
  notification: Notifications.Notification,
): string | null {
  const data = notification.request.content.data as { url?: unknown } | undefined;
  return typeof data?.url === 'string' ? data.url : null;
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
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      redirect(response.notification);
    });
    return () => subscription.remove();
  }, [nav]);
}

export function openNotificationUrl(url: string): void {
  router.push(url as never);
}
