import { AiConsentCard } from "@/components/ai-consent";
import { useAiConsent } from "@/lib/ai-consent";
import { AppIntentsBridge } from "@/lib/app-intents";
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

/**
 * The AI consent gate. Every save path, and every hook that saves on its own
 * (onboarding replay, a resumed share, queued Siri captures), lives in
 * AppStack below, so holding AppStack back is what guarantees nothing is
 * saved before the answer.
 *
 * Past onboarding, AppStack is not mounted at all until the answer is known.
 * During onboarding it has to stay mounted, since unmounting would lose the
 * flow's place: the card covers it instead, and the one save that can run
 * there (`useDemoSave`) waits on the same answer.
 */
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
  // Spatial slide transitions are the first thing to cut under Reduce Motion.
  const reducedMotion = useReducedMotion();

  const entitlement = useEntitlement();
  // A purchase or restore reaches Convex by webhook a moment later; until it
  // does, someone who just paid is not sent back to the gate.
  const awaitingPurchase = useAwaitingOnboardingPurchase(entitlement.entitled);
  // The wait belongs to the account that paid; signing out ends it.
  useEffect(() => {
    if (!isAuthenticated && !isLoading) endPurchaseLandingSession();
  }, [isAuthenticated, isLoading]);
  // No entry without a plan. Until the plan is known the requested screen
  // stays mounted under a cover with sign-out in reach, so a cold-launch deep
  // link keeps its destination and a stalled read is no way in or dead end.
  const planUnknown =
    isAuthenticated && entitlement.loading && !awaitingPurchase;
  const gated =
    isAuthenticated &&
    !entitlement.loading &&
    !entitlement.entitled &&
    !awaitingPurchase;

  // After sign-in, replay deferred onboarding spaces + demo link, then paywall.
  useReplayOnboarding();
  // If a Share Sheet intent arrived while signed out / mid-onboarding, resume
  // it, once the plan gate is down.
  useResumePendingShare(gated || planUnknown);
  // Remind trialers two days before the yearly plan starts charging.
  useTrialReminder();
  // Right after Pro starts, Home hands off to one real save.
  useWelcomeSaveTracker();
  // The exit offer is gone; clears what it left on this device.
  useForgetExitOffer();

  if (isLoading) {
    return <ScreenLoader label={t("loading.app")} />;
  }

  // Onboarding runs BEFORE sign-in. Only kick users to the sign-in screen
  // once they've finished onboarding but haven't authenticated yet.
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
              // Transparent native header over the full-bleed hero; the screen
              // fills in the toolbar buttons (share/delete) once the item loads.
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
              // iOS 26 native soft scroll edge: the feed fades out under the header.
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
            name="add"
            options={
              Platform.OS === "android"
                ? {
                    // Android owns presentation inside add.tsx with Expo UI's native
                    // Material 3 BottomSheet. Keep this route visually transparent so
                    // the current tab remains behind the sheet and its scrim.
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
                    // Sized to its content so the compact action menu and the
                    // taller note/article composer both fit without a fixed
                    // detent leaving the editor unreachable.
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
        {/* Profile and Settings stay reachable from the plan gate: sign out,
            restore and account deletion must never sit behind a purchase. */}
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
              // Android form sheets have no native header, so the screen
              // draws its own title and close button, as Profile does.
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
        {/* Onboarding opens the paywall fallback before onboarding
            completes, so it sits outside both guards. Each guard names its
            redirect: without one, Expo Router falls back to the shortest
            unguarded route name, which is `paywall`. */}
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
