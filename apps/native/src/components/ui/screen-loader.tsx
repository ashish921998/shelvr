import { t, useAppLocale } from "@/lib/i18n";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function ScreenLoader({ label = t("Loading") }: { label?: string }) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
}));
