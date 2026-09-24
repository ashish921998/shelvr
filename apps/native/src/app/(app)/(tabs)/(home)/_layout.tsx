import { t, useAppLocale } from "@/lib/i18n";
import { Wordmark } from "@/components/wordmark";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { usePaywallGuard } from "@/lib/entitlement";
import { Stack, useRouter } from "expo-router";
import { Platform } from "react-native";
import { useTabStackChrome } from "@/lib/tab-stack-chrome";

export default function HomeStackLayout() {
  useAppLocale();
  const router = useRouter();
  const { haptic, labelColor, screenOptions, tap } = useTabStackChrome();
  const { guard, loading: entitlementLoading } = usePaywallGuard("home");

  // Add and Map are Pro features — route to the paywall unless entitled.
  // Suppress haptic until entitlement resolves — firing it during loading
  // would imply the action is about to run when the guard will drop it.
  const guardedTap = (href: "/add") => () => {
    if (entitlementLoading) return;
    haptic();
    void guard(() => router.push(href));
  };

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="index"
        options={
          Platform.OS === "android"
            ? {
                headerLeft: () => (
                  <HeaderIconButton
                    icon="person.fill"
                    label={t("navigation.profile")}
                    onPress={tap("/profile")}
                  />
                ),
                headerRight: () => (
                  <HeaderIconButton
                    icon="plus"
                    label={t("capture.add")}
                    onPress={guardedTap("/add")}
                  />
                ),
              }
            : undefined
        }
      >
        <Stack.Title asChild>
          <Wordmark size={26} />
        </Stack.Title>
        {Platform.OS === "ios" ? (
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              icon="person"
              tintColor={labelColor}
              onPress={tap("/profile")}
            >
              {t("navigation.profile")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        ) : null}
        {Platform.OS === "ios" ? (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              icon="plus"
              tintColor={labelColor}
              onPress={guardedTap("/add")}
            >
              {t("common.add")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        ) : null}
      </Stack.Screen>
    </Stack>
  );
}
