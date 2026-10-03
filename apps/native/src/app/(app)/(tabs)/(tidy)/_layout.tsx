import { t, useAppLocale } from "@/lib/i18n";
import { Stack } from "expo-router";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTabStackChrome } from "@/lib/tab-stack-chrome";

export default function TidyStackLayout() {
  useAppLocale();
  const { screenOptions } = useTabStackChrome({ headerTransparent: true });
  return (
    <Stack screenOptions={{ ...screenOptions, headerTitleStyle: styles.title }}>
      <Stack.Screen name="index" options={{ gestureEnabled: false }}>
        <Stack.Title asChild>
          <Text testID="tidy-screen-title" style={styles.title}>
            {t("navigation.tidyHeader")}
          </Text>
        </Stack.Title>
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
