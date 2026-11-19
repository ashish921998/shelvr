import type { PlaceKind } from "@convex/model/placeKinds";
import { t } from "@/lib/i18n";
import { KIND_LABELS } from "@/lib/map-filters";
import { KIND_EMOJI } from "@/lib/map-pin-emoji";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function MapKindRow({
  kinds,
  selected,
  onSelect,
}: {
  kinds: PlaceKind[];
  selected: readonly PlaceKind[];
  onSelect: (kind: PlaceKind) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t("map.filters")}
      contentContainerStyle={styles.row}
    >
      {kinds.map((kind) => {
        const picked = selected.includes(kind);
        return (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={t(KIND_LABELS[kind])}
            accessibilityState={{ selected: picked }}
            onPress={() => onSelect(kind)}
            style={({ pressed }) => [
              styles.tile,
              selected.length > 0 && !picked && styles.dimmed,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.emoji}>{KIND_EMOJI[kind]}</Text>
            <View style={[styles.labelBox, picked && styles.labelPicked]}>
              <Text
                numberOfLines={1}
                style={[styles.label, picked && styles.labelPickedText]}
              >
                {t(KIND_LABELS[kind])}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    gap: theme.gap(0.5),
    paddingHorizontal: theme.gap(1.5),
  },
  tile: {
    minWidth: 68,
    alignItems: "center",
    gap: theme.gap(0.25),
    paddingVertical: theme.gap(0.5),
  },
  dimmed: { opacity: 0.55 },
  pressed: { opacity: theme.opacity.pressed },
  emoji: {
    fontSize: 32,
    lineHeight: 40,
  },
  labelBox: {
    paddingHorizontal: theme.gap(0.75),
    paddingVertical: 2,
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
  },
  labelPicked: { backgroundColor: theme.colors.foreground },
  label: {
    ...theme.type.labelStrong,
    color: theme.colors.foreground,
    textShadowColor: theme.colors.frame,
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 0 },
  },
  labelPickedText: {
    color: theme.colors.background,
    textShadowRadius: 0,
  },
}));
