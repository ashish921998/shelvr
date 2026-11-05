import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import type { WentFilter } from "@/lib/passport";
import type { TextMessageKey } from "@/locales/message-types";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const OPTIONS: { value: WentFilter; label: TextMessageKey }[] = [
  { value: "all", label: "map.filterAll" },
  { value: "want", label: "passport.wantToGo" },
  { value: "went", label: "passport.wentNoDate" },
];

export function MapWentSwitch({
  selected,
  onSelect,
}: {
  selected: WentFilter;
  onSelect: (value: WentFilter) => void;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      <View style={styles.track} accessibilityRole="tablist">
        {OPTIONS.map(({ value, label }) => {
          const on = value === selected;
          return (
            <Pressable
              key={value}
              testID={`map-went-${value}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (on) return;
                void haptics.selection();
                onSelect(value);
              }}
              hitSlop={{ top: 8, bottom: 8 }}
              style={[styles.segment, on && styles.segmentOn]}
            >
              <Text style={[styles.label, on && styles.labelOn]}>
                {t(label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { paddingHorizontal: theme.gap(2), alignItems: "flex-start" },
  track: {
    flexDirection: "row",
    padding: 3,
    gap: 2,
    borderRadius: 999,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.16)",
  },
  segment: {
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.75),
    borderRadius: 999,
    borderCurve: "continuous",
  },
  segmentOn: { backgroundColor: theme.colors.foreground },
  label: { ...theme.type.secondaryLabel, color: theme.colors.foreground },
  labelOn: { color: theme.colors.background },
}));
