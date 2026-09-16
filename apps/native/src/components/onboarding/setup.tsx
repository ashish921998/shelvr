import { onboardingLabel } from "@/lib/onboarding-labels";
import { t, useAppLocale } from "@/lib/i18n";
import { CtaButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { getSpacePresets, SAVE_KINDS, type SaveKind } from "@/lib/save-kinds";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function SetupStep({
  kinds,
  spaces,
  onToggleKind,
  onToggleSpace,
  onAddSpace,
  onAdvance,
}: {
  kinds: SaveKind[];
  spaces: string[];
  onToggleKind: (kind: SaveKind) => void;
  onToggleSpace: (name: string) => void;
  onAddSpace: (name: string) => void;
  onAdvance: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const candidates = [...new Set([...getSpacePresets(kinds), ...spaces])];

  const commitDraft = () => {
    const name = draft.trim();
    if (name !== "") onAddSpace(name);
    setDraft("");
    setAdding(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.headline}>{t("onboarding.setupTitle")}</Text>

      <View style={styles.grid}>
        {SAVE_KINDS.map((kind) => {
          const active = kinds.includes(kind);
          return (
            <Pressable
              key={kind}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => onToggleKind(kind)}
              style={({ pressed }) => [
                styles.kind,
                active && styles.kindActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={[styles.kindLabel, active && styles.kindLabelActive]}
                numberOfLines={1}
              >
                {onboardingLabel(kind)}
              </Text>
              {active ? (
                <View style={styles.tick}>
                  <AppSymbolIcon
                    name="checkmark"
                    size={11}
                    tintColor={theme.colors.primaryForeground}
                  />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {kinds.length > 0 ? (
        <View style={styles.spaces}>
          <View style={styles.spacesHead}>
            <Text style={styles.subhead}>{t("onboarding.yourSpaces")}</Text>
            <Text style={styles.hint}>{t("onboarding.spacesChangeable")}</Text>
          </View>
          <View style={styles.chips}>
            {candidates.map((name) => {
              const active = spaces.includes(name);
              return (
                <Pressable
                  key={name}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  onPress={() => onToggleSpace(name)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[styles.chipLabel, active && styles.chipLabelActive]}
                  >
                    {onboardingLabel(name)}
                  </Text>
                </Pressable>
              );
            })}
            {adding ? (
              <TextInput
                autoFocus
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={commitDraft}
                onBlur={commitDraft}
                maxLength={60}
                returnKeyType="done"
                placeholder={t("onboarding.newSpacePlaceholder")}
                placeholderTextColor={theme.colors.faint}
                style={[styles.chip, styles.chipInput]}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setAdding(true)}
                style={({ pressed }) => [
                  styles.chip,
                  styles.chipNew,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.chipNewLabel}>
                  {t("onboarding.newSpace")}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}

      <View style={styles.foot}>
        <CtaButton
          label={t("common.continue")}
          onPress={onAdvance}
          disabled={spaces.length === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  kind: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1.75),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  kindActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  kindLabel: {
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  kindLabelActive: {
    color: theme.colors.primaryText,
  },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  spaces: {
    gap: theme.gap(1.25),
    marginTop: theme.gap(1),
  },
  spacesHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  subhead: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.foreground,
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.muted,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  chip: {
    paddingVertical: theme.gap(1),
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
  chipLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  chipLabelActive: {
    color: theme.colors.primaryText,
  },
  chipNew: {
    borderStyle: "dashed",
  },
  chipNewLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
  chipInput: {
    minWidth: 140,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.foreground,
    borderColor: theme.colors.primary,
  },
  foot: {
    marginTop: "auto",
    paddingTop: theme.gap(2),
  },
}));
