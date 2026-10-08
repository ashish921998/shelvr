import { AppIntentsBridge } from "@/lib/app-intents";
import { useExitOfferReminder } from "@/lib/exit-offer-reminder";
import { ExitOfferSheetHost } from "@/lib/exit-offer-sheet";
import { t, useAppLocale } from "@/lib/i18n";
import { useOnboarding } from "@/lib/onboarding";
import { HomeFeedProvider } from "@/lib/home-feed";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { TrialReminderPrimerSheet } from "@/components/trial-reminder-sheet";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { useReplayOnboarding } from "@/lib/replay-onboarding";
import { useResumePendingShare } from "@/lib/share/use-resume-pending-share";
import { useTrialReminder } from "@/lib/trial-reminder";
import { useWelcomeSaveTracker } from "@/lib/welcome-save";
import { RecentSavesWidgetSync } from "@/lib/widget-sync";
import { useConvexAuth } from "convex/react";
import { Redirect, Stack, useRouter } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { Platform } from "react-native";
import { useUnistyles } from "react-native-unistyles";

export default function AppLayout() {
  useAppLocale();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const { theme } = useUnistyles();
  // Spatial slide transitions are the first thing to cut under Reduce Motion.
  const reducedMotion = useReducedMotion();

  // After sign-in, replay deferred onboarding spaces + demo link, then paywall.
  useReplayOnboarding();
  // If a Share Sheet intent arrived while signed out / mid-onboarding, resume it.
  useResumePendingShare();
  // Remind trialers two days before the yearly plan starts charging.
  useTrialReminder();
  // Right after Pro starts, Home hands off to one real save.
  useWelcomeSaveTracker();
  useExitOfferReminder();

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
      <ExitOfferSheetHost />
      <TrialReminderPrimerSheet />
      <Stack
        screenOptions={{
          animation: reducedMotion ? "fade" : "default",
          headerTransparent: true,
          headerShadowVisible: false,
          headerTintColor: theme.colors.primary,
        }}
      >
        <Stack.Protected guard={onboarded}>
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
                    onPress={() => router.replace("/")}
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
            name="import"
            options={{
              presentation: "formSheet",
              headerShown: true,
              headerTransparent: false,
              headerStyle: { backgroundColor: theme.colors.background },
              headerBackButtonDisplayMode: "minimal",
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
          <Stack.Screen
            name="camera"
            options={{
              presentation: "fullScreenModal",
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        {/* Onboarding opens the paywall fallback before onboarding
            completes. Keep it last: the first available screen is the initial
            route, so it must be (tabs) or onboarding. */}
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
    </HomeFeedProvider>
  );
}
