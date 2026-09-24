import { LegalConsentBoundary } from "@/components/legal-consent";
import { OnboardingProvider } from "@/lib/onboarding";
import { useEntitlementSync } from "@/lib/entitlement";
import { analytics } from "@/lib/analytics";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { authStorage } from "@/lib/auth-storage";
import { convex, persister, queryClient } from "@/lib/query-client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Slot, useRouter, useSegments, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PostHogProvider } from "posthog-react-native";
import { useUnistyles } from "react-native-unistyles";
import { isDarkThemeName } from "@/lib/appearance";
import {
  NotificationSessionProvider,
  useNotificationObserver,
} from "@/lib/notifications";
import { SplashGate, useSplashGate } from "@/components/splash/splash-gate";
import { NavThemeProvider } from "@/lib/nav-theme";
import { useAnalyticsIdentity } from "@/lib/analytics-identity";
import { useConvexQueryHealing } from "@/lib/convex-query-healing";
import { posthog } from "@/lib/posthog";

// Expo Router reads the root boundary from this module's exports.
export { RootErrorBoundary as ErrorBoundary } from "@/components/root-error-boundary";

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

/** Owns analytics identify/reset and the Convex cache clearing on the auth
 * edge. See useAnalyticsIdentity — the one session boundary. */
function AnalyticsIdentity() {
  useAnalyticsIdentity();
  return null;
}

/** Re-subscribes Convex queries that errored under a previous identity. */
function ConvexQueryHealer() {
  useConvexQueryHealing();
  return null;
}

/** Configures RevenueCat and logs the Convex Auth user in so webhook events
 * carry the same `userId` every Convex table keys on. Rendered once inside the
 * providers. */
function EntitlementSync() {
  useEntitlementSync();
  return null;
}

export default function RootLayout() {
  const router = useRouter();
  const { rt } = useUnistyles();
  // The launch animation plays once per process, over the booting app — and
  // not at all when a share intent, deep link or notification is taking the
  // user somewhere specific.
  const { showSplash, finishSplash } = useSplashGate();
  // Contrast with the active app theme. The camera screen renders its own
  // light StatusBar over the viewfinder; while the splash is up the
  // theme-driven bar applies, and the splash picks its ground from the theme.
  const statusBarStyle = isDarkThemeName(rt.themeName) ? "light" : "dark";
  const appContent = (
    <OnboardingProvider>
      <EntitlementSync />
      <NavThemeProvider>
        <SplashGate active={showSplash} onFinish={finishSplash}>
          <LegalConsentBoundary>
            <Slot />
          </LegalConsentBoundary>
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
          // in the union, so route it through the Href type Expo Router takes.
          router.replace(url as Href);
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
          <AnalyticsIdentity />
          <PostHogScreenTracking />
          <NotificationSetup />
          <ConvexQueryHealer />
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
