import { OnboardingProvider } from '@/lib/onboarding';
import { analytics } from '@/lib/analytics';
import { useEntitlementSync } from '@/lib/entitlement';
import { currentUserQuery, useCurrentUser } from '@/lib/current-user';
import { posthog } from '@/lib/posthog';
import { ConvexAuthProvider, type TokenStorage } from '@convex-dev/auth/react';
import { convex, persister, queryClient } from '@/lib/query-client';
import { useConvexAuth } from 'convex/react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as SecureStore from 'expo-secure-store';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PostHogProvider } from 'posthog-react-native';
import { useUnistyles } from 'react-native-unistyles';

// Convex Auth persists its JWT + refresh token client-side. In React Native we
// must supply the storage ourselves — wrap Keychain-backed expo-secure-store
// behind the synchronous-looking TokenStorage interface the provider expects.
const authStorage: TokenStorage = {
  getItem: (key) => SecureStore.getItem(key),
  setItem: (key, value) => void SecureStore.setItem(key, value),
  removeItem: (key) => void SecureStore.deleteItemAsync(key),
};

// Single source of truth for the native route background. The navigator paints
// every screen's container with the navigation theme's `background`, so setting
// it here — instead of a `contentStyle` on each screen — themes all nested
// stacks at once and paints the screen container before JS content mounts (no
// white flash on push / zoom transitions). `useColorScheme` is the reliable
// system-appearance signal; the palette comes from Unistyles.
function PostHogIdentity() {
  const { isAuthenticated } = useConvexAuth();
  const { data: user, isFetching } = useCurrentUser();
  const identifiedUserId = useRef<string | undefined>(undefined);
  const clearedUnauthenticatedUserCache = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      analytics.reset();
      identifiedUserId.current = undefined;
      // This persisted query depends on auth even though its Convex key does
      // not. Clear its old value before a later account can observe it, once
      // per unauthenticated interval so the reactive query cannot loop.
      if (!clearedUnauthenticatedUserCache.current) {
        clearedUnauthenticatedUserCache.current = true;
        void queryClient.resetQueries({ queryKey: currentUserQuery.queryKey });
      }
      return;
    }

    clearedUnauthenticatedUserCache.current = false;

    // Do not identify cached data while the auth-dependent Convex query is
    // reconnecting after sign-in or an account change.
    if (isFetching || !user || identifiedUserId.current === user._id) {
      return;
    }

    analytics.identify(user._id, user.email);
    identifiedUserId.current = user._id;
  }, [isAuthenticated, isFetching, user]);

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
  const router = useRouter();
  const appContent = (
    <OnboardingProvider>
      <EntitlementSync />
      <NavThemeProvider>
        <Slot />
        <StatusBar style="auto" />
      </NavThemeProvider>
    </OnboardingProvider>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexAuthProvider
        client={convex}
        storage={authStorage}
        // After an OAuth sign-in completes, Convex Auth redirects back to the
        // app with a `?code=` query param. With Expo Router we must navigate to
        // the cleaned URL ourselves so the param doesn't linger and re-trigger.
        replaceURL={(url) => {
          // `url` is a relative href (e.g. "/"); typed routes can't prove it's
          // in the union, so cast through the href type Expo Router expects.
          router.replace(url as never);
          return Promise.resolve();
        }}
      >
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24, buster: 'v1' }}
        >
          <PostHogIdentity />
          {posthog ? <PostHogProvider client={posthog}>{appContent}</PostHogProvider> : appContent}
        </PersistQueryClientProvider>
      </ConvexAuthProvider>
    </GestureHandlerRootView>
  );
}

/** Configures RevenueCat and logs the Convex Auth user in so webhook events
 * carry the same `userId` every Convex table keys on. Rendered once inside the
 * providers. */
function EntitlementSync() {
  useEntitlementSync();
  return null;
}
