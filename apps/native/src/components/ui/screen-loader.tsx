import { t, useAppLocale } from "@/lib/i18n";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { StitchMark } from "@/components/ui/stitch-mark";

export function ScreenLoader({
  label = t("common.loading"),
}: {
  label?: string;
}) {
  useAppLocale();
  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <StitchMark />
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
