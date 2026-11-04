import type { PlaceKind } from "@convex/model/placeKinds";
import { haptics } from "@/lib/haptics";
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

const KIND_EMOJI: Record<PlaceKind, string> = {
  food: "🍽️",
  coffee: "☕",
  dessert: "🍰",
  drinks: "🍸",
  dateNight: "💕",
  activities: "🎟️",
  shopping: "🛍️",
  stay: "🛏️",
};

function Chip({
  label,
  emoji,
  selected,
  onPress,
}: {
  label: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const text = (
    <Text style={[styles.label, selected && styles.labelSelected]}>
      {emoji ? `${emoji} ${label}` : label}
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
      <Chip
        label={t("map.filterAll")}
        selected={selected === null}
        onPress={() => choose(null)}
      />
      {kinds.map((kind) => (
        <Chip
          key={kind}
          label={t(KIND_LABELS[kind])}
          emoji={KIND_EMOJI[kind]}
          selected={selected === kind}
          onPress={() => choose(selected === kind ? null : kind)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { gap: theme.gap(1), paddingHorizontal: theme.gap(2) },
  flush: { paddingHorizontal: 0, paddingVertical: theme.gap(0.5) },
  chip: {
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.16)",
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
  label: {
    ...theme.type.secondaryLabel,
    lineHeight: 20,
    color: theme.colors.foreground,
  },
  labelSelected: { color: theme.colors.onTint },
  pressed: { opacity: theme.opacity.pressed },
}));
