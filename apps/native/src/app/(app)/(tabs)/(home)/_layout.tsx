import { t, useAppLocale } from "@/lib/i18n";
import { Wordmark } from "@/components/wordmark";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { useSaveGuard } from "@/lib/free-plan";
import { SavedSectionProvider, useSavedSection } from "@/lib/saved-section";
import { Stack, useRouter } from "expo-router";
import { Platform } from "react-native";
import { useTabStackChrome } from "@/lib/tab-stack-chrome";

export default function HomeStackLayout() {
  return (
    <SavedSectionProvider>
      <SavedStack />
    </SavedSectionProvider>
  );
}

function SavedStack() {
  useAppLocale();
  const { selectSection } = useSavedSection();
  const router = useRouter();
  const { labelColor, screenOptions, tap } = useTabStackChrome({
    softScrollEdge: true,
  });
  const { guard, loading: entitlementLoading } = useSaveGuard("home");

  const openAdd = () => {
    if (entitlementLoading) return;
    void guard(() => {
      selectSection("places");
      router.push("/add");
    });
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
                    onPress={openAdd}
                  />
                ),
              }
            : undefined
        }
      >
        <Stack.Title asChild>
          <Wordmark size={31} />
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
              onPress={openAdd}
            >
              {t("common.add")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        ) : null}
      </Stack.Screen>
    </Stack>
  );
}
