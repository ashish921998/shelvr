import { t, useAppLocale } from "@/lib/i18n";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function BeenMapCard({
  count,
  onEdit,
  onLayout,
}: {
  count: number;
  onEdit: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <View style={styles.card} onLayout={onLayout}>
      <View style={styles.row}>
        <Text style={styles.title}>{t("been.mapTitle", { count })}</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={theme.gap(1.5)}
          testID="map-been-edit"
          onPress={onEdit}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.edit}>{t("been.edit")}</Text>
        </Pressable>
      </View>
      <Text style={styles.body}>{t("map.emptyBody")}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.gap(2),
    gap: theme.gap(0.5),
    marginHorizontal: theme.gap(2),
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.gap(1.5),
  },
  title: {
    ...theme.type.headline,
    flex: 1,
    color: theme.colors.foreground,
  },
  edit: {
    ...theme.type.subheadStrong,
    color: theme.colors.primaryText,
  },
  body: {
    ...theme.type.subhead,
    color: theme.colors.muted,
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
}));
