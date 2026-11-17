import type { PlaceKind } from "@convex/model/placeKinds";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { KIND_ICONS, KIND_LABELS } from "@/lib/map-filters";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function MapFilterChip({
  label,
  icon,
  selected,
  onPress,
  role = "button",
  testID,
}: {
  label: string;
  icon?: AppSymbolName;
  selected: boolean;
  onPress: () => void;
  role?: "button" | "tab";
  testID?: string;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.target, pressed && styles.pressed]}
    >
      <View style={[styles.chip, selected ? styles.selected : styles.plain]}>
        {icon ? (
          <AppSymbolIcon
            name={icon}
            size={12}
            tintColor={
              selected ? theme.colors.background : theme.colors.foreground
            }
          />
        ) : null}
        <Text style={[styles.label, selected && styles.labelSelected]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function MapFilterChips({
  kinds,
  selected,
  onSelect,
  inset = true,
  inline = false,
}: {
  inset?: boolean;
  inline?: boolean;
  kinds: PlaceKind[];
  selected: PlaceKind | null;
  onSelect: (kind: PlaceKind | null) => void;
}) {
  const choose = (kind: PlaceKind | null) => {
    if (kind !== selected) void haptics.selection();
    onSelect(kind);
  };
  const chips = kinds.map((kind) => (
    <MapFilterChip
      key={kind}
      label={t(KIND_LABELS[kind])}
      icon={KIND_ICONS[kind]}
      selected={selected === kind}
      onPress={() => choose(selected === kind ? null : kind)}
    />
  ));
  if (inline) return <View style={[styles.row, styles.inline]}>{chips}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t("map.filters")}
      contentContainerStyle={[styles.row, !inset && styles.flush]}
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
    paddingVertical: theme.gap(0.5),
  },
  inline: { paddingHorizontal: 0, paddingVertical: 0 },
  flush: { paddingHorizontal: 0, paddingVertical: theme.gap(0.5) },
  target: {
    minWidth: theme.control.minHeight,
    minHeight: theme.control.minHeight,
    justifyContent: "center",
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.5),
    minHeight: theme.gap(3.5),
    paddingVertical: theme.gap(0.5),
    paddingHorizontal: theme.gap(1.25),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    boxShadow: "0 1px 3px rgba(43, 36, 24, 0.10)",
  },
  selected: { backgroundColor: theme.colors.foreground },
  plain: { backgroundColor: theme.colors.surface },
  label: {
    ...theme.type.labelStrong,
    color: theme.colors.foreground,
  },
  labelSelected: { color: theme.colors.background },
  pressed: { opacity: theme.opacity.pressed },
}));
