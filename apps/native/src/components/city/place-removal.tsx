import { t } from "@/lib/i18n";
import type { usePlaceRemoval } from "@/lib/place-removal";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function PlaceRemovalUndo({
  removal,
}: {
  removal: ReturnType<typeof usePlaceRemoval>;
}) {
  if (!removal.undo) return null;
  return (
    <View style={styles.bar} accessibilityLiveRegion="polite">
      <Text style={styles.message}>
        {t("cityMap.removedPlace", { name: removal.undo.name })}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={removal.busy}
        onPress={() => void removal.restore()}
        style={styles.action}
      >
        <Text style={styles.label}>{t("common.undo")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  bar: {
    position: "absolute",
    left: theme.gap(2),
    right: theme.gap(2),
    bottom: rt.insets.bottom + theme.gap(12),
    flexDirection: "row",
    alignItems: "center",
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.foreground,
  },
  message: { flex: 1, ...theme.type.footnote, color: theme.colors.surface },
  action: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: theme.gap(1),
  },
  label: { ...theme.type.button, color: theme.colors.surface },
}));
