import type { PlaceKind } from "@convex/model/placeKinds";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { KIND_ICONS, KIND_LABELS } from "@/lib/map-filters";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function Chip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: AppSymbolName;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const text = (
    <Text style={[styles.label, selected && styles.labelSelected]}>
      {label}
    </Text>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {/* Solid, not glass: a see-through chip is unreadable over busy map labels. */}
      <View style={[styles.chip, selected ? styles.selected : styles.plain]}>
        <AppSymbolIcon
          name={icon}
          size={16}
          tintColor={
            selected ? theme.colors.primaryText : theme.colors.foreground
          }
        />
        {text}
      </View>
    </Pressable>
  );
}

export function MapFilterChips({
  kinds,
  selected,
  onSelect,
  inset = true,
}: {
  inset?: boolean;
  kinds: PlaceKind[];
  selected: PlaceKind | null;
  onSelect: (kind: PlaceKind | null) => void;
}) {
  const choose = (kind: PlaceKind | null) => {
    if (kind !== selected) void haptics.selection();
    onSelect(kind);
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t("map.filters")}
      contentContainerStyle={[styles.row, !inset && styles.flush]}
    >
      {kinds.map((kind) => (
        <Chip
          key={kind}
          label={t(KIND_LABELS[kind])}
          icon={KIND_ICONS[kind]}
          selected={selected === kind}
          onPress={() => choose(selected === kind ? null : kind)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
    paddingVertical: theme.gap(0.5),
  },
  flush: { paddingHorizontal: 0, paddingVertical: theme.gap(0.5) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    boxShadow: "0 1px 3px rgba(43, 36, 24, 0.16)",
    minHeight: theme.control.minHeight,
    justifyContent: "center",
    paddingHorizontal: theme.gap(1.75),
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderCurve: "continuous",
  },
  selected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primaryText,
  },
  plain: { backgroundColor: theme.colors.frame },
  label: {
    ...theme.type.secondaryLabel,
    color: theme.colors.foreground,
  },
  labelSelected: { color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
}));
