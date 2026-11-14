import { t, useAppLocale } from "@/lib/i18n";
import { Stack } from "expo-router";
import { Platform, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function PassportStackLayout() {
  useAppLocale();
  const { theme } = useUnistyles();

  return (
    <Stack
      screenOptions={{
        headerTransparent: Platform.OS === "ios",
        headerStyle:
          Platform.OS === "android"
            ? { backgroundColor: theme.colors.background }
            : undefined,
        headerShadowVisible: false,
        headerTitleAlign: "center",
        scrollEdgeEffects: { top: "soft" },
      }}
    >
      <Stack.Screen
        name="index"
        options={
          Platform.OS === "android"
            ? { title: t("passport.title"), headerTitleStyle: styles.title }
            : undefined
        }
      >
        {Platform.OS === "ios" ? (
          <Stack.Title asChild>
            <Text style={styles.title} accessibilityRole="header">
              {t("passport.title")}
            </Text>
          </Stack.Title>
        ) : null}
      </Stack.Screen>
    </Stack>
  );
}

const styles = StyleSheet.create((theme) => ({
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 31,
    color: theme.colors.foreground,
  },
}));
