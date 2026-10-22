import { t, useAppLocale } from "@/lib/i18n";
import { EVENING_AFTER, type EveningAfter } from "@/lib/sample-trip";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const LABELS = {
  walk: "plan.eveningWalk",
  drinks: "plan.eveningDrinks",
  dessert: "plan.eveningDessert",
} as const;

export function EveningChips({
  picked,
  onPick,
}: {
  picked: EveningAfter;
  onPick: (after: EveningAfter) => void;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      <Text style={styles.label}>{t("plan.eveningLabel")}</Text>
      <View style={styles.chips}>
        {EVENING_AFTER.map((after) => {
          const active = after === picked;
          return (
            <Pressable
              key={after}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onPick(after)}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.chipLabel, active && styles.chipLabelActive]}
              >
                {t(LABELS[after])}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    gap: theme.gap(1),
  },
  label: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: theme.gap(1.75),
    borderRadius: 50,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
  chipLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  chipLabelActive: {
    color: theme.colors.primaryText,
  },
}));
