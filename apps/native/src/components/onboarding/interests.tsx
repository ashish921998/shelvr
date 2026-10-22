import { CtaButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { ActionMenu } from "@/components/ui/action-menu";
import { withAlpha } from "@/lib/color";
import { t, useAppLocale } from "@/lib/i18n";
import { INTERESTS, type Interest } from "@/lib/onboarding-interests";
import { onboardingLabel } from "@/lib/onboarding-labels";
import {
  SAMPLE_CITIES,
  SAMPLE_CITY_IDS,
  type SampleCityId,
} from "@/lib/sample-cities";
import {
  TRAVEL_VIBES,
  TRAVEL_INTEREST,
  type TravelVibe,
} from "@/lib/travel-vibes";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const FADE_HEIGHT = 32;

export function InterestsStep({
  picked,
  vibes,
  city,
  onToggle,
  onToggleVibe,
  onPickCity,
  onAdvance,
}: {
  picked: readonly Interest[];
  vibes: readonly TravelVibe[];
  city: SampleCityId | null;
  onToggle: (interest: Interest) => void;
  onToggleVibe: (vibe: TravelVibe) => void;
  onPickCity: (city: SampleCityId | null) => void;
  onAdvance: () => void;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      <View style={styles.scroll}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.head}>
            <Text
              style={styles.headline}
              maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
            >
              {t("interests.title")}
            </Text>
            <Text style={styles.support}>{t("interests.help")}</Text>
          </View>

          <View style={styles.chips}>
            {INTERESTS.map((interest) => (
              <Chip
                key={interest}
                label={onboardingLabel(interest)}
                active={picked.includes(interest)}
                onPress={() => onToggle(interest)}
              />
            ))}
          </View>

          {picked.includes(TRAVEL_INTEREST) ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.eyebrow}>
                  {onboardingLabel(TRAVEL_INTEREST)}
                </Text>
                <Text style={styles.cardTitle}>
                  {t("interests.vibesTitle")}
                </Text>
              </View>
              <View style={styles.chips}>
                {TRAVEL_VIBES.map((vibe) => (
                  <Chip
                    key={vibe}
                    label={onboardingLabel(vibe)}
                    active={vibes.includes(vibe)}
                    small
                    onPress={() => onToggleVibe(vibe)}
                  />
                ))}
              </View>
              <CityField city={city} onPick={onPickCity} />
            </View>
          ) : null}
        </ScrollView>
        <View pointerEvents="none" style={styles.fade} />
      </View>

      <View style={styles.foot}>
        <CtaButton
          label={t("common.continue")}
          onPress={onAdvance}
          disabled={picked.length === 0}
        />
      </View>
    </View>
  );
}

function CityField({
  city,
  onPick,
}: {
  city: SampleCityId | null;
  onPick: (city: SampleCityId | null) => void;
}) {
  const { theme } = useUnistyles();
  const notSure = t("interests.cityNotSure");
  const cities = SAMPLE_CITY_IDS.map((id) => ({
    id,
    name: t(SAMPLE_CITIES[id].name),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const value = city === null ? notSure : t(SAMPLE_CITIES[city].name);
  return (
    <View style={styles.city}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{t("interests.cityTitle")}</Text>
        <Text style={styles.cityHelp}>{t("interests.cityHelp")}</Text>
      </View>
      <ActionMenu
        label={`${t("interests.cityTitle")} ${value}`}
        title={t("interests.cityTitle")}
        actions={[
          {
            id: "none",
            label: notSure,
            selected: city === null,
            onPress: () => onPick(null),
          },
          ...cities.map(({ id, name }) => ({
            id,
            label: name,
            selected: city === id,
            onPress: () => onPick(id),
          })),
        ]}
      >
        <View style={styles.cityField}>
          <Text style={styles.cityValue} numberOfLines={1}>
            {value}
          </Text>
          <AppSymbolIcon
            name="chevron.up.chevron.down"
            size={14}
            tintColor={theme.colors.muted}
          />
        </View>
      </ActionMenu>
    </View>
  );
}

function Chip({
  label,
  active,
  small = false,
  onPress,
}: {
  label: string;
  active: boolean;
  small?: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        active && styles.chipActive,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          small && styles.chipLabelSmall,
          active && styles.chipLabelActive,
        ]}
      >
        {label}
      </Text>
      {active ? (
        <AppSymbolIcon
          name="checkmark"
          size={13}
          tintColor={theme.colors.primary}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  body: {
    gap: theme.gap(3),
    paddingBottom: FADE_HEIGHT,
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: FADE_HEIGHT,
    experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(
      theme.colors.background,
      0,
    )} 0%, ${theme.colors.background} 100%)`,
  },
  head: {
    gap: theme.gap(1),
  },
  headline: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.foreground,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  chip: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(2),
    borderRadius: 50,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSmall: {
    minHeight: 44,
    paddingVertical: theme.gap(1),
    backgroundColor: theme.colors.background,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  chipLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  chipLabelSmall: {
    fontSize: 15,
  },
  chipLabelActive: {
    color: theme.colors.primaryText,
  },
  card: {
    gap: theme.gap(1.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cardHead: {
    gap: theme.gap(0.5),
  },
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  cardTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: theme.colors.foreground,
  },
  city: {
    gap: theme.gap(1.5),
    paddingTop: theme.gap(2),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  cityHelp: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: theme.colors.muted,
  },
  cityField: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  cityValue: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  foot: {
    paddingTop: theme.gap(1),
  },
}));
