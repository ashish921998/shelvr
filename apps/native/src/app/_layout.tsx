import { OnboardingProvider } from "@/lib/onboarding";
import { noteAppTouch, useEntitlementSync } from "@/lib/entitlement";
import { analytics } from "@/lib/analytics";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { authStorage } from "@/lib/auth-storage";
import { convex, persister, queryClient } from "@/lib/query-client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Slot, useRouter, useSegments, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { t } from "@/lib/i18n";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PostHogProvider } from "posthog-react-native";
import { useUnistyles } from "react-native-unistyles";
import { dropMenuDismissTouch } from "@/components/ui/action-menu";
import { isDarkThemeName } from "@/lib/appearance";
import {
  NotificationSessionProvider,
  useNotificationObserver,
  useNotificationSession,
} from "@/lib/notifications";
import { SplashGate, useSplashGate } from "@/components/splash/splash-gate";
import { NavThemeProvider } from "@/lib/nav-theme";
import { useAnalyticsIdentity } from "@/lib/analytics-identity";
import { useAppIntentsSignOutReset } from "@/lib/app-intents";
import { useConvexQueryHealing } from "@/lib/convex-query-healing";
import { useSignOutWhenAccountGone } from "@/lib/account-gone";
import { posthog } from "@/lib/posthog";
import { resolveRootHref } from "@/lib/home-href";

export { RootErrorBoundary as ErrorBoundary } from "@/components/root-error-boundary";

function PostHogScreenTracking() {
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

function AnalyticsIdentity() {
  useAnalyticsIdentity();
  return null;
}

function AppIntentsSignOutReset() {
  useAppIntentsSignOutReset();
  return null;
}

function AccountGoneSignOut() {
  useSignOutWhenAccountGone();
  return null;
}

function AccountDeletionGate({ children }: { children: ReactNode }) {
  const { operation } = useNotificationSession();
  return operation === "delete_account" ? (
    <ScreenLoader label={t("loading.app")} />
  ) : (
    children
  );
}

function ConvexQueryHealer() {
  useConvexQueryHealing();
  return null;
}

function EntitlementSync() {
  useEntitlementSync();
  return null;
}

export default function RootLayout() {
  const router = useRouter();
  const { rt } = useUnistyles();
  const { showSplash, finishSplash } = useSplashGate();
  const statusBarStyle = isDarkThemeName(rt.themeName) ? "light" : "dark";
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
    <GestureHandlerRootView
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        noteAppTouch();
        return dropMenuDismissTouch();
      }}
    >
      <ConvexAuthProvider
        client={convex}
        storage={authStorage}
        replaceURL={(url) => {
          router.replace(resolveRootHref(url) as Href);
          return Promise.resolve();
        }}
      >
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24,
            buster: "v2",
            dehydrateOptions: {
              shouldDehydrateQuery: (query) =>
                query.queryKey[0] !== "convexQuery",
            },
          }}
        >
          <AnalyticsIdentity />
          <AppIntentsSignOutReset />
          <PostHogScreenTracking />
          <NotificationSetup />
          <ConvexQueryHealer />
          <AccountGoneSignOut />
          <NotificationSessionProvider>
            <AccountDeletionGate>
              {posthog ? (
                <PostHogProvider client={posthog} autocapture={false}>
                  {appContent}
                </PostHogProvider>
              ) : (
                appContent
              )}
            </AccountDeletionGate>
          </NotificationSessionProvider>
        </PersistQueryClientProvider>
      </ConvexAuthProvider>
    </GestureHandlerRootView>
  );
}
