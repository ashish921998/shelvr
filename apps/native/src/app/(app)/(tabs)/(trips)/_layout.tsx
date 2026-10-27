import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { t, useAppLocale } from "@/lib/i18n";
import { useTabStackChrome } from "@/lib/tab-stack-chrome";
import { Stack } from "expo-router";
import { Platform, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export default function TripsStackLayout() {
  useAppLocale();
  const { labelColor, screenOptions, tap } = useTabStackChrome({
    softScrollEdge: true,
  });
  const planTrip = tap("/new-trip");

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="index"
        options={
          Platform.OS === "android"
            ? {
                title: t("tripPlanner.listTitle"),
                headerTitleStyle: styles.title,
                headerRight: () => (
                  <HeaderIconButton
                    icon="plus"
                    label={t("tripPlanner.planTrip")}
                    onPress={planTrip}
                  />
                ),
              }
            : undefined
        }
      >
        {Platform.OS === "ios" ? (
          <Stack.Title asChild>
            <Text style={styles.title} accessibilityRole="header">
              {t("tripPlanner.listTitle")}
            </Text>
          </Stack.Title>
        ) : null}
        {Platform.OS === "ios" ? (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              icon="plus"
              tintColor={labelColor}
              onPress={planTrip}
            >
              {t("tripPlanner.planTrip")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        ) : null}
      </Stack.Screen>
    </Stack>
  );
}

const styles = StyleSheet.create((theme) => ({
  // The size of Home's wordmark, so the two tab headers match.
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 31,
    color: theme.colors.foreground,
  },
}));
