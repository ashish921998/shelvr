import { ThemedText } from "@/components/ui/themed-text";
import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type Props = {
  labels: string[];
  selected: number;
  onSelect: (index: number) => void;
  tinted?: boolean;
  scroll?: boolean;
  accessibilityLabel?: string;
};

export function TripSegments({
  labels,
  selected,
  onSelect,
  tinted = false,
  scroll = false,
  accessibilityLabel,
}: Props) {
  const row = (
    <View
      style={[styles.row, !scroll && styles.fill]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {labels.map((label, index) => {
        const active = index === selected;
        return (
          <Pressable
            key={`${index}-${label}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
              onSelect(index);
            }}
            hitSlop={4}
            style={[
              styles.segment,
              !scroll && styles.segmentFill,
              active && (tinted ? styles.tintedPill : styles.pill),
            ]}
          >
            <ThemedText
              variant={active ? "labelStrong" : "label"}
              numberOfLines={1}
              style={
                active ? (tinted ? styles.onTint : styles.active) : styles.idle
              }
            >
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  if (!scroll) return <View style={styles.track}>{row}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroller}
    >
      {row}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    padding: theme.gap(0.5),
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted,
  },
  scroller: {
    paddingHorizontal: theme.gap(2),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.5),
  },
  fill: {
    alignSelf: "stretch",
  },
  segment: {
    minHeight: 36,
    paddingHorizontal: theme.gap(1.75),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderCurve: "continuous",
  },
  segmentFill: {
    flex: 1,
  },
  pill: {
    backgroundColor: theme.colors.surface,
  },
  tintedPill: {
    backgroundColor: theme.colors.primary,
  },
  active: {
    color: theme.colors.foreground,
  },
  onTint: {
    color: theme.colors.onTint,
  },
  idle: {
    color: theme.colors.muted,
  },
}));
