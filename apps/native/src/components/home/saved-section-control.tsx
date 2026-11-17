import { ThemedText } from "@/components/ui/themed-text";
import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import type { SavedSection } from "@/lib/saved-section";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const options = [
  { value: "places", label: "saved.places" },
  { value: "lists", label: "saved.lists" },
] as const;

export function SavedSectionControl({
  selected,
  onSelect,
}: {
  selected: SavedSection;
  onSelect: (section: SavedSection) => void;
}) {
  useAppLocale();
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map(({ value, label }) => {
        const active = value === selected;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              void haptics.selection();
              onSelect(value);
            }}
            style={[styles.segment, active && styles.selected]}
          >
            <ThemedText
              variant="subheadStrong"
              style={active && styles.selectedLabel}
            >
              {t(label)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    flexDirection: "row",
    gap: theme.gap(0.5),
    marginHorizontal: theme.gap(2),
    marginBottom: theme.gap(1.5),
    padding: theme.gap(0.5),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  segment: {
    flex: 1,
    minHeight: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
  },
  selected: { backgroundColor: theme.colors.foreground },
  selectedLabel: { color: theme.colors.background },
}));
