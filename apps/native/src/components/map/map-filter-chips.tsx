import { GlassView, hasLiquidGlass } from "@/components/glass";
import type { PlaceKind } from "@convex/model/placeKinds";
import { t } from "@/lib/i18n";
import type { TextMessageKey } from "@/locales/message-types";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const KIND_LABELS: Record<PlaceKind, TextMessageKey> = {
  food: "map.kindFood",
  coffee: "map.kindCoffee",
  dessert: "map.kindDessert",
  drinks: "map.kindDrinks",
  dateNight: "map.kindDateNight",
  activities: "map.kindActivities",
  shopping: "map.kindShopping",
  stay: "map.kindStay",
};

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
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
      {selected ? (
        <View style={[styles.chip, styles.selected]}>{text}</View>
      ) : hasLiquidGlass ? (
        <GlassView isInteractive style={styles.chip}>
          {text}
        </GlassView>
      ) : (
        <View style={[styles.chip, styles.plain]}>{text}</View>
      )}
    </Pressable>
  );
}

export function MapFilterChips({
  kinds,
  selected,
  onSelect,
}: {
  kinds: PlaceKind[];
  selected: PlaceKind | null;
  onSelect: (kind: PlaceKind | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t("map.filters")}
      contentContainerStyle={styles.row}
    >
      <Chip
        label={t("map.filterAll")}
        selected={selected === null}
        onPress={() => onSelect(null)}
      />
      {kinds.map((kind) => (
        <Chip
          key={kind}
          label={t(KIND_LABELS[kind])}
          selected={selected === kind}
          onPress={() => onSelect(selected === kind ? null : kind)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { gap: theme.gap(1), paddingHorizontal: theme.gap(2) },
  chip: {
    overflow: "hidden",
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(2),
    borderRadius: 999,
    borderCurve: "continuous",
  },
  selected: { backgroundColor: theme.colors.primary },
  plain: {
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  label: { ...theme.type.secondaryLabel, color: theme.colors.foreground },
  labelSelected: { color: theme.colors.onTint },
  pressed: { opacity: theme.opacity.pressed },
}));
