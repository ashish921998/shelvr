import { t, useAppLocale } from "@/lib/i18n";
import * as Haptics from "expo-haptics";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Stack, useRouter } from "expo-router";
import { Platform, PlatformColor, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function SpacesStackLayout() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();

  const labelColor =
    Platform.OS === "ios" ? PlatformColor("label") : theme.colors.foreground;

  // Native bar-button items don't run JS on tap the way a Pressable does, so
  // the light haptic HeaderButton used to give is fired here instead.
  const newSpace = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push("/new-space");
  };

  return (
    <Stack
      screenOptions={{
        // FlashList does not consistently apply a transparent native header's
        // inset on Android. Let the native header own its space there; iOS can
        // retain the translucent, content-under-header treatment.
        headerTransparent: Platform.OS === "ios",
        headerStyle:
          Platform.OS === "android"
            ? { backgroundColor: theme.colors.background }
            : undefined,
        headerShadowVisible: false,
        headerTitleAlign: "center",
        headerTintColor: theme.colors.primary,
      }}
    >
      <Stack.Screen
        name="index"
        options={
          Platform.OS === "android"
            ? {
                title: t("navigation.spacesHeader"),
                headerTitleStyle: styles.title,
                headerRight: () => (
                  <HeaderIconButton
                    icon="plus"
                    label={t("spaces.newTitle")}
                    onPress={newSpace}
                  />
                ),
              }
            : undefined
        }
      >
        {Platform.OS === "ios" ? (
          <Stack.Title asChild>
            <Text style={styles.title}>{t("navigation.spacesHeader")}</Text>
          </Stack.Title>
        ) : null}
        {Platform.OS === "ios" ? (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              icon="plus"
              tintColor={labelColor}
              onPress={newSpace}
            >
              {t("spaces.newTitle")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        ) : null}
      </Stack.Screen>
    </Stack>
  );
}

const styles = StyleSheet.create((theme) => ({
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 26,
    letterSpacing: 0.5,
    color: theme.colors.foreground,
  },
}));
