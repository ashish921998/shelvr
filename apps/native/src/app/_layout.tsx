import { OnboardingProvider } from '@/lib/onboarding';
import { posthog } from '@/lib/posthog';
import { convex, persister, queryClient } from '@/lib/query-client';
import { ClerkProvider, useAuth, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { useUnistyles } from 'react-native-unistyles';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error('Add your Clerk Publishable Key to the .env file');
}

// Single source of truth for the native route background. The navigator paints
// every screen's container with the navigation theme's `background`, so setting
// it here — instead of a `contentStyle` on each screen — themes all nested
// stacks at once and paints the screen container before JS content mounts (no
// white flash on push / zoom transitions). `useColorScheme` is the reliable
// system-appearance signal; the palette comes from Unistyles.
function PostHogIdentity() {
  const { isLoaded, user } = useUser();
  const posthogClient = usePostHog();
  const identifiedUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!user) {
      identifiedUserId.current = undefined;
      return;
    }

    if (identifiedUserId.current === user.id) {
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress;
    const name = user.fullName ?? user.firstName;

    posthogClient.identify(user.id, {
      $set: {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      },
    });
    identifiedUserId.current = user.id;
  }, [isLoaded, posthogClient, user]);

  return null;
}

function NavThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const { theme } = useUnistyles();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: theme.colors.background,
      card: theme.colors.background,
      text: theme.colors.foreground,
      border: theme.colors.border,
      primary: theme.colors.primary,
    },
  };

  // Keep the native root view / window (behind the routes: launch, overscroll
  // bounce, transparent sheets) in sync with the theme too.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  return <ThemeProvider value={navTheme}>{children}</ThemeProvider>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24, buster: 'v1' }}
          >
            <PostHogProvider client={posthog}>
              <PostHogIdentity />
              <OnboardingProvider>
                <NavThemeProvider>
                  <Slot />
                  <StatusBar style="auto" />
                </NavThemeProvider>
              </OnboardingProvider>
            </PostHogProvider>
          </PersistQueryClientProvider>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}
