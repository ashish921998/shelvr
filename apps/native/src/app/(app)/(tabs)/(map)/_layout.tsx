import { t, useAppLocale } from "@/lib/i18n";
import { Stack } from "expo-router";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTabStackChrome } from "@/lib/tab-stack-chrome";

export default function MapStackLayout() {
  useAppLocale();
  const { screenOptions } = useTabStackChrome({ headerTransparent: true });
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index">
        <Stack.Title asChild>
          <Text testID="map-screen-title" style={styles.title}>
            {t("navigation.mapHeader")}
          </Text>
        </Stack.Title>
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
