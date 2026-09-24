import { t, useAppLocale } from "@/lib/i18n";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Stack } from "expo-router";
import { Platform, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTabStackChrome } from "@/lib/tab-stack-chrome";

export default function SpacesStackLayout() {
  useAppLocale();
  const { theme } = useUnistyles();
  const { labelColor, screenOptions, tap } = useTabStackChrome();
  const newSpace = tap("/new-space");

  return (
    <Stack
      screenOptions={{
        ...screenOptions,
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
    fontSize: 31,
    letterSpacing: 0.5,
    color: theme.colors.foreground,
  },
}));
