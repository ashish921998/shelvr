import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import type { WentFilter } from "@/lib/map-filters";
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
              style={styles.segment}
            >
              <View style={[styles.pill, on && styles.pillOn]}>
                <Text style={[styles.label, on && styles.labelOn]}>
                  {t(label)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { paddingHorizontal: theme.gap(2.5) },
  track: {
    flexDirection: "row",
    padding: theme.gap(0.5),
    gap: theme.gap(0.5),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    boxShadow: "0 1px 4px rgba(43, 36, 24, 0.08)",
  },
  segment: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: theme.control.minHeight,
    justifyContent: "center",
    alignItems: "center",
  },
  pill: {
    alignSelf: "stretch",
    minHeight: theme.gap(4.5),
    justifyContent: "center",
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
  },
  pillOn: { backgroundColor: theme.colors.primarySoft },
  label: {
    ...theme.type.label,
    textAlign: "center",
    color: theme.colors.muted,
  },
  labelOn: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.primaryText,
  },
}));
