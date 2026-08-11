import { useOnboarding } from '@/lib/onboarding';
import { ScreenLoader } from '@/components/ui/screen-loader';
import { useReplayOnboarding } from '@/lib/replay-onboarding';
import { useResumePendingShare } from '@/lib/share/use-resume-pending-share';
import { RecentSavesWidgetSync } from '@/lib/widget-sync';
import { useConvexAuth } from 'convex/react';
import { Redirect, Stack } from 'expo-router';
import { Fragment } from 'react';
import { useUnistyles } from 'react-native-unistyles';

export default function AppLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const { theme } = useUnistyles();

  // After sign-in, replay deferred onboarding spaces + demo link, then paywall.
  useReplayOnboarding();
  // If a Share Sheet intent arrived while signed out / mid-onboarding, resume it.
  useResumePendingShare();

  if (isLoading) {
    return <ScreenLoader label="Opening Shelvr" />;
  }

  // Onboarding runs BEFORE sign-in. Only kick users to the sign-in screen
  // once they've finished onboarding but haven't authenticated yet.
  if (!isAuthenticated && onboarded) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Fragment>
      <RecentSavesWidgetSync />
      <Stack
        screenOptions={{
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
            title: '',
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
        <Stack.Screen
          name="space/[id]"
          options={{
            title: '',
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
        <Stack.Screen
          name="add"
          options={{
            presentation: 'formSheet',
            headerShown: true,
            headerTransparent: false,
            headerStyle: { backgroundColor: theme.colors.background },
            sheetGrabberVisible: true,
            sheetAllowedDetents: 'fitToContents',
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
        <Stack.Screen
          name="new-space"
          options={{
            presentation: 'formSheet',
            headerShown: false,
            sheetGrabberVisible: true,
            sheetAllowedDetents: 'fitToContents',
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
        <Stack.Screen
          name="manage-spaces"
          options={{
            presentation: 'formSheet',
            headerShown: false,
            sheetGrabberVisible: true,
            sheetAllowedDetents: 'fitToContents',
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            presentation: 'formSheet',
            headerShown: false,
            sheetGrabberVisible: true,
            sheetAllowedDetents: 'fitToContents',
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
        <Stack.Screen
          name="camera"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'formSheet',
            headerShown: false,
            sheetGrabberVisible: true,
            sheetAllowedDetents: 'fitToContents',
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      </Stack>
    </Fragment>
  );
}
