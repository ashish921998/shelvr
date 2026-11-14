import { BackCircle } from "@/components/back-circle";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function ScreenTitle({ title }: { title: string }) {
  useAppLocale();
  const router = useRouter();
  return (
    <View style={styles.row}>
      <BackCircle label={t("common.back")} onPress={() => backOrHome(router)} />
      <ThemedText
        variant="displayTitle"
        accessibilityRole="header"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={styles.title}
      >
        {title}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: rt.insets.top + theme.gap(1.25),
    paddingBottom: theme.gap(2.5),
  },
  title: { flexShrink: 1, fontSize: 32, lineHeight: 40 },
}));
