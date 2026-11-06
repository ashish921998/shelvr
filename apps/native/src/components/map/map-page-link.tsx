import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { openLink } from "@/lib/open-link";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function MapPageLink({ url }: { url: string }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.card}>
      <ThemedText variant="caption" style={styles.muted}>
        {t("publicMap.linkLabel")}
      </ThemedText>
      <ThemedText testID="map-page-link" variant="body" selectable>
        {url}
      </ThemedText>
      <Pressable
        testID="map-page-preview"
        accessibilityRole="link"
        accessibilityLabel={t("publicMap.preview")}
        pressRetentionOffset={theme.control.pressRetentionOffset}
        onPress={() => void openLink(url).catch(() => {})}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        <ThemedText variant="subheadStrong" style={styles.actionLabel}>
          {t("publicMap.preview")}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.gap(0.5),
    paddingTop: theme.gap(1.5),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  muted: { color: theme.colors.muted },
  action: {
    minHeight: theme.control.minHeight,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  actionLabel: { color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
}));
