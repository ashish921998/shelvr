import { Wordmark } from '@/components/wordmark';
import { usePaywallGuard } from '@/lib/entitlement';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { Platform, PlatformColor } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

export default function HomeStackLayout() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const guard = usePaywallGuard();

  // PlatformColor('label') is iOS-only; on Android fall back to the theme's
  // foreground color.
  const labelColor = Platform.OS === 'ios' ? PlatformColor('label') : theme.colors.foreground;

  // Native bar-button items don't run JS on tap the way a Pressable does, so
  // the light haptic HeaderButton used to give is fired here instead.
  const tap = (href: '/profile') => () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(href);
  };

  // Add and Map are Pro features — route to the paywall unless entitled.
  const guardedTap = (href: '/add' | '/map') => () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    guard(() => router.push(href));
  };

  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index">
        <Stack.Title asChild>
          <Wordmark />
        </Stack.Title>
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="person"
            tintColor={labelColor}
            onPress={tap('/profile')}
          >
            Profile
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="map"
            tintColor={labelColor}
            onPress={guardedTap('/map')}
          >
            Map
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Button
            icon="plus"
            tintColor={labelColor}
            onPress={guardedTap('/add')}
          >
            Add
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      </Stack.Screen>
    </Stack>
  );
}
