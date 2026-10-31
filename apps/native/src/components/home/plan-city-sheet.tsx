import { AppSymbolIcon } from "@/components/symbol";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import type { CityPlanKind } from "@/lib/city-plan";
import type { City } from "@/lib/home-places";
import { t, useAppLocale } from "@/lib/i18n";
import { useRef } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function PlanCitySheet({
  visible,
  kind,
  cities,
  onClose,
  onPick,
}: {
  visible: boolean;
  kind: CityPlanKind;
  cities: City[];
  onClose: () => void;
  onPick: (city: string) => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const picked = useRef<string | null>(null);
  const flush = () => {
    const city = picked.current;
    picked.current = null;
    if (city !== null) onPick(city);
  };
  return (
    <PromptSheet
      testID="plan-city-sheet"
      visible={visible}
      onClose={onClose}
      onDismiss={flush}
      title={t(kind === "date" ? "homePlaces.planDate" : "homePlaces.planTrip")}
      body={t("homePlaces.planWhichCity")}
      actions={null}
    >
      <ScrollView style={styles.list}>
        {cities.map((entry) => (
          <Pressable
            key={entry.city}
            accessibilityRole="button"
            accessibilityLabel={
              entry.placeCount
                ? `${entry.city}, ${t("homePlaces.spotCount", { count: entry.placeCount })}`
                : entry.city
            }
            onPress={() => {
              picked.current = entry.city;
              onClose();
              if (process.env.EXPO_OS !== "ios") flush();
            }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.name} numberOfLines={1}>
              {entry.city}
            </Text>
            {entry.placeCount ? (
              <Text style={styles.count}>
                {t("homePlaces.spotCount", { count: entry.placeCount })}
              </Text>
            ) : null}
            <AppSymbolIcon
              name="chevron.right"
              size={14}
              tintColor={theme.colors.muted}
            />
          </Pressable>
        ))}
      </ScrollView>
    </PromptSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: { maxHeight: 360 },
  row: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { opacity: theme.opacity.pressed },
  name: {
    flex: 1,
    ...theme.type.subheadStrong,
    color: theme.colors.foreground,
  },
  count: { ...theme.type.footnote, color: theme.colors.muted },
}));
