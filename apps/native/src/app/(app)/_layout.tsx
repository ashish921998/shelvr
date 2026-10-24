import { AiConsentCard } from "@/components/ai-consent";
import { useAiConsent } from "@/lib/ai-consent";
import { AppIntentsBridge } from "@/lib/app-intents";
import { releaseSheetLink } from "@/lib/deferred-sheet-link";
import { useForgetExitOffer } from "@/lib/forget-exit-offer";
import { endPurchaseLandingSession } from "@/lib/purchase-landing";
import { t, useAppLocale } from "@/lib/i18n";
import { useEntitlement } from "@/lib/entitlement";
import { useOnboarding } from "@/lib/onboarding";
import { HomeFeedProvider } from "@/lib/home-feed";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { PlanLoadingCover } from "@/components/plan-loading-cover";
import { TrialReminderPrimerSheet } from "@/components/trial-reminder-sheet";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import {
  useAwaitingOnboardingPurchase,
  useReplayOnboarding,
} from "@/lib/replay-onboarding";
import { useQueuedFirstSave } from "@/lib/queued-first-save";
import { useResumePendingShare } from "@/lib/share/use-resume-pending-share";
import { useTrialReminder } from "@/lib/trial-reminder";
import { useWelcomeSaveTracker } from "@/lib/welcome-save";
import { RecentSavesWidgetSync } from "@/lib/widget-sync";
import { useConvexAuth } from "convex/react";
import { Redirect, Stack, useRouter } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function AppLayout() {
  useAppLocale();
  const { onboarded } = useOnboarding();
  const consent = useAiConsent();
  const { asking } = consent;

  if (onboarded && consent.savesBlocked) {
    return asking ? (
      <AiConsentCard />
    ) : (
      <ScreenLoader label={t("loading.app")} />
    );
  }

  return (
    <>
      <AppStack />
      {asking ? (
        <View style={styles.cover}>
          <AiConsentCard />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFillObject },
});

function AppStack() {
  useAppLocale();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const { theme } = useUnistyles();
  const reducedMotion = useReducedMotion();

  const entitlement = useEntitlement();
  const awaitingPurchase = useAwaitingOnboardingPurchase(entitlement.entitled);
  useEffect(() => {
    if (!isAuthenticated && !isLoading) endPurchaseLandingSession();
  }, [isAuthenticated, isLoading]);
  const planUnknown =
    isAuthenticated && entitlement.loading && !awaitingPurchase;
  const gated =
    isAuthenticated &&
    !entitlement.loading &&
    !entitlement.entitled &&
    !awaitingPurchase;

  const planLoading = entitlement.loading;
  const entitled = entitlement.entitled;
  useEffect(() => {
    const link = releaseSheetLink(planLoading);
    if (!link || (link.sheet && !(onboarded && entitled))) return;
    router.push(link.route as never);
  }, [planLoading, entitled, onboarded, router]);

  useReplayOnboarding();
  useQueuedFirstSave();
  useResumePendingShare(gated || planUnknown);
  useTrialReminder();
  useWelcomeSaveTracker();
  useForgetExitOffer();

  if (isLoading) {
    return <ScreenLoader label={t("loading.app")} />;
  }

  if (!isAuthenticated && onboarded) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <HomeFeedProvider>
      <RecentSavesWidgetSync />
      <AppIntentsBridge />
      <TrialReminderPrimerSheet />
      <Stack
        screenOptions={{
          animation: reducedMotion ? "fade" : "default",
          headerTransparent: true,
          headerShadowVisible: false,
          headerTintColor: theme.colors.primary,
        }}
      >
        <Stack.Protected
          guard={onboarded && !gated}
          redirectTo={onboarded ? "/plan-gate" : "/onboarding"}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="share" options={{ headerShown: false }} />
          <Stack.Screen
            name="item/[id]"
            options={{
              title: "",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="digest/[id]"
            options={{
              title: t("notifications.weeklyShelf"),
              headerBackButtonDisplayMode: "minimal",
              headerBackVisible: true,
              headerLeft: ({ canGoBack }) =>
                canGoBack ? null : (
                  <HeaderIconButton
                    icon="house.fill"
                    label={t("digest.backHome")}
                    onPress={() => router.replace("/(app)/(tabs)/(home)")}
                  />
                ),
            }}
          />
          <Stack.Screen
            name="space/[id]"
            options={{
              scrollEdgeEffects: { top: "soft" },
              title: "",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
          <Stack.Screen
            name="plan/[id]"
            options={{ title: "", headerBackButtonDisplayMode: "minimal" }}
          />
          <Stack.Screen
            name="trip/[id]"
            options={{ title: "", headerBackButtonDisplayMode: "minimal" }}
          />
          <Stack.Screen
            name="city/[name]"
            options={{ title: "", headerBackButtonDisplayMode: "minimal" }}
          />
        </Stack.Protected>
        {/* Native sheets and modals present above the loading cover, so they wait for the plan. */}
        <Stack.Protected
          guard={onboarded && !gated && !planUnknown}
          redirectTo={
            !onboarded
              ? "/onboarding"
              : gated
                ? "/plan-gate"
                : "/(app)/(tabs)/(home)"
          }
        >
          <Stack.Screen
            name="add"
            options={
              Platform.OS === "android"
                ? {
                    presentation: "transparentModal",
                    animation: "none",
                    headerShown: false,
                    gestureEnabled: false,
                    contentStyle: { backgroundColor: "transparent" },
                  }
                : {
                    presentation: "formSheet",
                    headerShown: true,
                    headerTransparent: false,
                    headerStyle: { backgroundColor: theme.colors.background },
                    sheetGrabberVisible: true,
                    sheetAllowedDetents: "fitToContents",
                    contentStyle: { backgroundColor: theme.colors.background },
                  }
            }
          />
          <Stack.Screen
            name="new-space"
            options={{
              presentation: "formSheet",
              headerShown: false,
              sheetGrabberVisible: true,
              sheetAllowedDetents: "fitToContents",
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
          <Stack.Screen
            name="manage-spaces"
            options={{
              presentation: "formSheet",
              headerShown: false,
              sheetGrabberVisible: true,
              sheetAllowedDetents: "fitToContents",
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
          <Stack.Screen
            name="camera"
            options={{
              presentation: "fullScreenModal",
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={onboarded} redirectTo="/onboarding">
          <Stack.Screen
            name="profile"
            options={{
              presentation: "formSheet",
              headerShown: false,
              sheetGrabberVisible: true,
              sheetAllowedDetents: "fitToContents",
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              presentation: "formSheet",
              headerShown: false,
              sheetGrabberVisible: true,
              sheetAllowedDetents: "fitToContents",
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
        </Stack.Protected>
        <Stack.Protected
          guard={onboarded && gated}
          redirectTo="/(app)/(tabs)/(home)"
        >
          <Stack.Screen name="plan-gate" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded} redirectTo="/(app)/(tabs)/(home)">
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        {/* Without a redirectTo, Expo Router falls back to the shortest unguarded route name: `paywall`. */}
        <Stack.Screen
          name="paywall"
          options={{
            presentation: "formSheet",
            headerShown: false,
            sheetGrabberVisible: true,
            sheetAllowedDetents: "fitToContents",
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
      </Stack>
      {onboarded && planUnknown ? <PlanLoadingCover /> : null}
    </HomeFeedProvider>
  );
}
