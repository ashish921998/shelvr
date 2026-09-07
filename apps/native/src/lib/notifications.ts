import { api } from '@convex/_generated/api';
import { useConvexAuth, useMutation } from 'convex/react';
import Constants from 'expo-constants';
import * as Localization from 'expo-localization';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import { NotificationDeviceSession } from './notification-device-session';

const tokenStorageKey = `notification-tokens-${(process.env.EXPO_PUBLIC_CONVEX_URL ?? 'default').replace(/[^A-Za-z0-9._-]/g, '_')}`;
export const notificationDeviceSession = new NotificationDeviceSession({
  read: async () => {
    const stored = await SecureStore.getItemAsync(tokenStorageKey);
    const tokens: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(tokens) || !tokens.every((token): token is string => typeof token === 'string')) {
      throw new Error('Invalid saved notification tokens');
    }
    return tokens;
  },
  write: (tokens) => SecureStore.setItemAsync(tokenStorageKey, JSON.stringify(tokens)),
});

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
  useEffect(() => {
    if (!isAuthenticated) {
      notificationDeviceSession.stop();
      return;
    }
    notificationDeviceSession.start();

    const register = async (devicePushToken?: Notifications.DevicePushToken) => {
      try {
        await notificationDeviceSession.register(
          () => getExpoPushToken(false, devicePushToken),
          (token) => registerDevice({
            token,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            timezone: getNotificationTimezone(),
          }),
        );
      } catch (error) {
        console.error('Notification registration failed', error);
      }
    };

    void register();
    const tokenListener = Notifications.addPushTokenListener((devicePushToken) => {
      void register(devicePushToken);
    });
    return () => {
      notificationDeviceSession.stop();
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
