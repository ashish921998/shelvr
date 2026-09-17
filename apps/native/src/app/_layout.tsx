import { t, useAppLocale } from "@/lib/i18n";
import { OnboardingProvider } from "@/lib/onboarding";
import { analytics } from "@/lib/analytics";
import { useEntitlementSync } from "@/lib/entitlement";
import { useCurrentUser } from "@/lib/current-user";
import { posthog } from "@/lib/posthog";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { authStorage } from "@/lib/auth-storage";
import {
  convex,
  persister,
  queryClient,
  restartConvexSubscription,
} from "@/lib/query-client";
import { observeAuthQueryErrors } from "@/lib/query-auth-recovery";
import { useConvexAuth } from "convex/react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  DarkTheme,
  DefaultTheme,
  Slot,
  ThemeProvider,
  usePathname,
  useRouter,
  useSegments,
  type ErrorBoundaryProps,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PostHogProvider } from "posthog-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { isDarkThemeName } from "@/lib/appearance";
import {
  NotificationSessionProvider,
  useNotificationObserver,
} from "@/lib/notifications";
import { SplashGate, useSplashGate } from "@/components/splash/splash-gate";

// Single source of truth for the native route background. The navigator paints
// every screen's container with the navigation theme's `background`, so setting
// it here — instead of a `contentStyle` on each screen — themes all nested
// stacks at once and paints the screen container before JS content mounts (no
// white flash on push / zoom transitions). `useColorScheme` is the reliable
// system-appearance signal; the palette comes from Unistyles.
function PostHogIdentity() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: user, isFetching } = useCurrentUser();
  const identifiedUserId = useRef<string | undefined>(undefined);
  const clearedUnauthenticatedUserCache = useRef(false);

  useEffect(() => {
    // Convex Auth reports signed out while it reads the stored token. Acting
    // then would reset analytics on every cold start.
    if (isLoading) return;
    if (!isAuthenticated) {
      void analytics.resetIfIdentified();
      identifiedUserId.current = undefined;
      // Convex query keys don't include the authenticated user. Remove every
      // Convex entry once per unauthenticated interval so its subscription
      // stops and a later account can never observe the previous user's data.
      if (!clearedUnauthenticatedUserCache.current) {
        clearedUnauthenticatedUserCache.current = true;
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] === "convexQuery",
        });
      }
      return;
    }

    clearedUnauthenticatedUserCache.current = false;

    // Do not identify cached data while the auth-dependent Convex query is
    // reconnecting after sign-in or an account change.
    if (isFetching || !user || identifiedUserId.current === user._id) {
      return;
    }

    analytics.identify(user._id);
    analytics.capture("auth_completed");
    identifiedUserId.current = user._id;
  }, [isAuthenticated, isLoading, isFetching, user]);

  return null;
}

function PostHogScreenTracking() {
  // Route segments retain placeholders such as [id], excluding saved item IDs,
  // URLs and OAuth query parameters from the analytics screen name.
  const route = useSegments().join("/");
  useEffect(() => {
    analytics.screen(route || "index");
  }, [route]);
  return null;
}

function NotificationSetup() {
  useNotificationObserver();
  return null;
}

/**
 * Root render-crash boundary. Reports the exception to error tracking and
 * offers a retry (which remounts the route tree) instead of Expo's bare
 * default screen. Nested routes without their own boundary land here.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useAppLocale();
  useEffect(() => {
    analytics.captureError("render_error", error);
  }, [error]);

  return (
    <View style={errorBoundaryStyles.container}>
      <Text style={errorBoundaryStyles.title}>
        {t("errors.unexpectedTitle")}
      </Text>
      <Text style={errorBoundaryStyles.message}>
        {t("errors.unexpectedBody")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={({ pressed }) => [
          errorBoundaryStyles.retry,
          pressed && errorBoundaryStyles.retryPressed,
        ]}
      >
        <Text style={errorBoundaryStyles.retryLabel}>
          {t("common.tryAgain")}
        </Text>
      </Pressable>
    </View>
  );
}

function NavThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, rt } = useUnistyles();
  // Base the navigator palette on the ACTIVE app theme, not the OS scheme:
  // the user can pin a dark appearance while the system stays light.
  const appThemeIsDark = isDarkThemeName(rt.themeName);
  const base = appThemeIsDark ? DarkTheme : DefaultTheme;

  const navTheme = {
    ...base,
    dark: appThemeIsDark,
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
  const pathname = usePathname();
  const { rt } = useUnistyles();
  // The launch animation plays once per process, over the booting app — and
  // not at all when a share intent, deep link or notification is taking the
  // user somewhere specific.
  const { showSplash, finishSplash } = useSplashGate();
  // Contrast with the active app theme (not the OS scheme); camera stays light
  // over the viewfinder. The splash pins its own warm paper ground regardless
  // of theme, so while it is up the status bar has to match that, not the app.
  const appThemeIsDark = isDarkThemeName(rt.themeName);
  const statusBarStyle = showSplash
    ? "dark"
    : pathname === "/camera" || appThemeIsDark
      ? "light"
      : "dark";
  const appContent = (
    <OnboardingProvider>
      <EntitlementSync />
      <NavThemeProvider>
        <SplashGate active={showSplash} onFinish={finishSplash}>
          <Slot />
        </SplashGate>
        <StatusBar style={statusBarStyle} />
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
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24,
            buster: "v2",
            // Restoring a user-scoped Convex query before auth initialization
            // both exposes stale account data and starts an unauthenticated
            // subscription. Keep persistence for non-Convex TanStack queries.
            dehydrateOptions: {
              shouldDehydrateQuery: (query) =>
                query.queryKey[0] !== "convexQuery",
            },
          }}
        >
          <PostHogIdentity />
          <PostHogScreenTracking />
          <NotificationSetup />
          <ConvexErroredQueryHealer />
          <NotificationSessionProvider>
            {posthog ? (
              <PostHogProvider client={posthog} autocapture={false}>
                {appContent}
              </PostHogProvider>
            ) : (
              appContent
            )}
          </NotificationSessionProvider>
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

function ConvexErroredQueryHealer() {
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated) return;
    return observeAuthQueryErrors(queryClient, restartConvexSubscription);
  }, [isAuthenticated]);
  return null;
}

const errorBoundaryStyles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.gap(4),
    paddingBottom: rt.insets.bottom + theme.gap(2),
    gap: theme.gap(1),
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.foreground,
  },
  message: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.muted,
    textAlign: "center",
    lineHeight: 21,
  },
  retry: {
    marginTop: theme.gap(2),
    borderRadius: 24,
    backgroundColor: theme.colors.foreground,
    paddingHorizontal: theme.gap(3),
    paddingVertical: theme.gap(1.5),
  },
  retryPressed: { opacity: 0.75 },
  retryLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.background,
  },
}));
