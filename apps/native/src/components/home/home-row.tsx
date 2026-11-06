import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { withAlpha } from "@/lib/color";
import { t } from "@/lib/i18n";
import { countLabel } from "@/lib/save-list";
import { Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function HomeRow({
  icon,
  name,
  count,
  onPress,
}: {
  icon: AppSymbolName;
  name: string;
  count?: string | number;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const shown = typeof count === "number" ? countLabel(count, false) : count;
  const title =
    shown === undefined
      ? name
      : t("homePlaces.rowCount", { title: name, n: shown });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shown === undefined ? name : `${name}, ${shown}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <AppSymbolIcon name={icon} size={20} tintColor={theme.colors.primary} />
      <ThemedText style={styles.title} numberOfLines={1}>
        {title}
      </ThemedText>
      <AppSymbolIcon
        name="chevron.right"
        size={13}
        weight="semibold"
        tintColor={withAlpha(theme.colors.muted, 0.25)}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    height: 47,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(2),
    paddingRight: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  pressed: { opacity: theme.opacity.pressed },
  title: { flex: 1, minWidth: 0, fontSize: 16.5, lineHeight: 21 },
}));
