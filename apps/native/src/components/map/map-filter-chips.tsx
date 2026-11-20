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
  discover,
}: {
  inset?: boolean;
  inline?: boolean;
  discover?: { on: boolean; onToggle: () => void };
  kinds: PlaceKind[];
  selected: PlaceKind | readonly PlaceKind[] | null;
  onSelect: (kind: PlaceKind | null) => void;
}) {
  const multiple = Array.isArray(selected);
  const choose = (kind: PlaceKind | null) => {
    if (!multiple && kind !== selected) void haptics.selection();
    onSelect(kind);
  };
  const selection =
    typeof selected === "string" ? [selected] : (selected ?? []);
  const discoverChip = discover ? (
    <MapFilterChip
      key="discover"
      label={t("map.discover")}
      icon="sparkles"
      selected={discover.on}
      onPress={() => {
        void haptics.selection();
        discover.onToggle();
      }}
    />
  ) : null;
  const kindChips = kinds.map((kind) => {
    const picked = selection.includes(kind);
    return (
      <MapFilterChip
        key={kind}
        label={t(KIND_LABELS[kind])}
        icon={KIND_ICONS[kind]}
        selected={picked}
        onPress={() => choose(picked && !multiple ? null : kind)}
      />
    );
  });
  const chips = [discoverChip, ...kindChips];
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
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
  },
  selected: {
    backgroundColor: theme.colors.foreground,
    borderColor: theme.colors.foreground,
  },
  plain: {
    backgroundColor: theme.colors.frame,
    borderColor: theme.colors.border,
  },
  label: {
    ...theme.type.labelStrong,
    color: theme.colors.foreground,
  },
  labelSelected: { color: theme.colors.background },
  pressed: { opacity: theme.opacity.pressed },
}));
