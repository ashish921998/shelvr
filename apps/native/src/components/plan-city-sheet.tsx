import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import { t, useAppLocale } from "@/lib/i18n";
import type { CityOption } from "@/lib/make-plan";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** The "Anywhere" row, which puts no city on the plan. */
const ANYWHERE = "";

/**
 * "Where are you going?": the cities a space's saves were filed in, most
 * first, then Anywhere. Shown only when there are two or more. `onPick`
 * gets the chosen city, or undefined for Anywhere.
 */
export function PlanCitySheet({
  visible,
  cities,
  total,
  onClose,
  onPick,
}: {
  visible: boolean;
  cities: CityOption[];
  /** Ready saves in the space, the count Anywhere shows. */
  total: number;
  onClose: () => void;
  onPick: (city: string | undefined) => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [picked, setPicked] = useState(cities[0]?.name ?? ANYWHERE);
  const rows = [
    ...cities,
    { name: ANYWHERE, count: total } satisfies CityOption,
  ];
  return (
    <PromptSheet
      visible={visible}
      onClose={onClose}
      title={t("plan.cityTitle")}
      body={t("plan.cityBody")}
      testID="plan-city-sheet"
      actions={
        <>
          <CtaButton
            label={t("plan.make")}
            onPress={() => onPick(picked === ANYWHERE ? undefined : picked)}
          />
          <GhostButton label={t("common.notNow")} onPress={onClose} />
        </>
      }
    >
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("plan.cityTitle")}
        style={styles.options}
      >
        {rows.map((row) => {
          const active = row.name === picked;
          const label = row.name === ANYWHERE ? t("plan.anywhere") : row.name;
          return (
            <Pressable
              key={row.name}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${label}, ${t("plan.placeCount", { count: row.count })}`}
              onPress={() => setPicked(row.name)}
              style={({ pressed }) => [
                styles.option,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={[styles.optionLabel, active && styles.optionLabelActive]}
                numberOfLines={1}
              >
                {label}
              </Text>
              <View style={styles.optionEnd}>
                <Text style={styles.optionCount}>
                  {t("plan.placeCount", { count: row.count })}
                </Text>
                <View style={[styles.radio, active && styles.radioOn]} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </PromptSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  options: {
    marginTop: theme.gap(0.5),
  },
  option: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  optionLabel: {
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 17,
    color: theme.colors.foreground,
  },
  optionLabelActive: {
    color: theme.colors.primaryText,
  },
  optionEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  optionCount: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.muted,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.faint,
  },
  radioOn: {
    borderWidth: 7,
    borderColor: theme.colors.primary,
  },
}));
