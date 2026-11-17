import { MapFilterChip } from "@/components/map/map-filter-chips";
import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import type { WentFilter } from "@/lib/map-filters";
import type { TextMessageKey } from "@/locales/message-types";
import { View } from "react-native";
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
    <View style={styles.row} accessibilityRole="tablist">
      {OPTIONS.map(({ value, label }) => (
        <MapFilterChip
          key={value}
          testID={`map-went-${value}`}
          role="tab"
          label={t(label)}
          selected={value === selected}
          onPress={() => {
            if (value === selected) return;
            void haptics.selection();
            onSelect(value);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "center", gap: theme.gap(1) },
}));
