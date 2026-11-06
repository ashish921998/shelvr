import type { PlaceKind } from "@convex/model/placeKinds";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { KIND_LABELS } from "@/lib/map-filters";
import { KIND_EMOJI } from "@/lib/map-pin-emoji";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

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
      {emoji ? <Text style={styles.emoji}>{`${emoji} `}</Text> : null}
      {label}
    </Text>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10 }}
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
  row: { gap: theme.gap(1), paddingHorizontal: theme.gap(2.5) },
  flush: { paddingHorizontal: 0, paddingVertical: theme.gap(0.5) },
  chip: {
    boxShadow: "0 1px 3px rgba(43, 36, 24, 0.16)",
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 12,
    borderCurve: "continuous",
  },
  selected: { backgroundColor: theme.colors.primary },
  plain: { backgroundColor: theme.colors.frame },
  label: {
    ...theme.type.secondaryLabel,
    fontSize: 13.3,
    lineHeight: 17,
    color: theme.colors.foreground,
  },
  emoji: { fontSize: 12 },
  labelSelected: { color: theme.colors.onTint },
  pressed: { opacity: theme.opacity.pressed },
}));
