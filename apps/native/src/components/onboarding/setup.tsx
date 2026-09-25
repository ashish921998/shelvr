import { onboardingLabel } from "@/lib/onboarding-labels";
import { t, useAppLocale } from "@/lib/i18n";
import { CtaButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { getSpacePresets, SAVE_KINDS, type SaveKind } from "@/lib/save-kinds";
import { TypeMark } from "@/components/ink/type-mark";
import { kindMark } from "@/lib/ink/save-mark";
import { MAX_SPACE_NAME_LENGTH } from "@convex/model/spaceName";
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
              <View style={styles.kindMark}>
                <TypeMark
                  kind={kindMark(kind)}
                  size={30}
                  seed={SAVE_KINDS.indexOf(kind)}
                  tint={active ? theme.colors.ink.light : undefined}
                />
              </View>
              <Text
                style={[styles.kindLabel, active && styles.kindLabelActive]}
                numberOfLines={1}
              >
                {onboardingLabel(kind)}
              </Text>
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
                  {active ? (
                    <AppSymbolIcon
                      name="checkmark"
                      size={12}
                      tintColor={theme.colors.primary}
                    />
                  ) : null}
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
                maxLength={MAX_SPACE_NAME_LENGTH}
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
          disabled={kinds.length === 0 || spaces.length === 0}
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
    overflow: "hidden",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  // A picked kind is ink-filled with its mark drawn in paper.
  kindActive: {
    borderColor: theme.colors.foreground,
    backgroundColor: theme.colors.foreground,
  },
  kindMark: { height: 58, alignItems: "center", justifyContent: "center" },
  kindLabel: {
    paddingHorizontal: theme.gap(1.25),
    paddingTop: theme.gap(0.75),
    paddingBottom: theme.gap(0.75),
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.foreground,
  },
  kindLabelActive: {
    color: theme.colors.primaryText,
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
    fontSize: 15,
    color: theme.colors.foreground,
  },
  hint: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.faint,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(0.75),
  },
  chip: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
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
