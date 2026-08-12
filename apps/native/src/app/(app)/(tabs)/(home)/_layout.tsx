import { Wordmark } from '@/components/wordmark';
import { HeaderIconButton } from '@/components/ui/header-icon-button';
import { usePaywallGuard } from '@/lib/entitlement';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { Platform, PlatformColor } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

export default function HomeStackLayout() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const { guard, loading: entitlementLoading } = usePaywallGuard();
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
  // Suppress haptic until entitlement resolves — firing it during loading
  // would imply the action is about to run when the guard will drop it.
  const guardedTap = (href: '/add') => () => {
    if (entitlementLoading) return;
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    void guard(() => router.push(href));
  };

  return (
    <Stack
      screenOptions={{
        // FlashList does not consistently apply transparent-header insets on
        // Android. Native headers own their space there; iOS keeps the
        // content-under-header treatment.
        headerTransparent: Platform.OS === 'ios',
        headerStyle: Platform.OS === 'android'
          ? { backgroundColor: theme.colors.background }
          : undefined,
        headerShadowVisible: false,
        headerTitleAlign: 'center',
      }}
    >
      <Stack.Screen
        name="index"
        options={Platform.OS === 'android' ? {
          headerLeft: () => <HeaderIconButton icon="person.fill" label="Profile" onPress={tap('/profile')} />,
          headerRight: () => <HeaderIconButton icon="plus" label="Add save" onPress={guardedTap('/add')} />,
        } : undefined}
      >
        <Stack.Title asChild>
          <Wordmark />
        </Stack.Title>
        {Platform.OS === 'ios' ? (
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button icon="person" tintColor={labelColor} onPress={tap('/profile')}>
              Profile
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        ) : null}
        {Platform.OS === 'ios' ? (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button icon="plus" tintColor={labelColor} onPress={guardedTap('/add')}>
              Add
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        ) : null}
      </Stack.Screen>
    </Stack>
  );
}
