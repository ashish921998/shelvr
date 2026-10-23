import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import { SETUP_STEPS, type SetupStep } from "@/lib/setup-checklist";
import type { TextMessageKey } from "@/locales/message-types";
import { GhostButton } from "@/components/onboarding/parts";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const COPY: Record<
  SetupStep,
  { emoji: string; title: TextMessageKey; body: TextMessageKey }
> = {
  tiktok: { emoji: "🎵", title: "setup.tiktok", body: "setup.tiktokBody" },
  instagram: {
    emoji: "📸",
    title: "setup.instagram",
    body: "setup.instagramBody",
  },
  paste: { emoji: "📝", title: "setup.paste", body: "setup.pasteBody" },
};

function StepRow({
  step,
  done,
  onPress,
}: {
  step: SetupStep;
  done: boolean;
  onPress?: () => void;
}) {
  const { theme } = useUnistyles();
  const copy = COPY[step];
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ checked: done }}
      disabled={onPress === undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { opacity: theme.opacity.pressed },
      ]}
    >
      <View style={styles.tile}>
        <Text style={styles.emoji}>{copy.emoji}</Text>
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, done && styles.titleDone]}>
          {t(copy.title)}
        </Text>
        <Text style={styles.body}>{t(copy.body)}</Text>
      </View>
      <View style={[styles.mark, done && styles.markOn]}>
        {done ? (
          <AppSymbolIcon
            name="checkmark"
            size={12}
            weight="bold"
            tintColor={theme.colors.onTint}
          />
        ) : onPress ? (
          <AppSymbolIcon
            name="chevron.right"
            size={12}
            tintColor={theme.colors.muted}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

/** "Get set up": the three ways to save, ticked off from the saves on Home. */
export function SetupChecklist({
  progress,
  onDismiss,
  onShown,
}: {
  progress: Record<SetupStep, boolean>;
  onDismiss?: () => void;
  onShown?: () => void;
}) {
  useAppLocale();
  const router = useRouter();
  useEffect(() => {
    onShown?.();
  }, [onShown]);
  const done = SETUP_STEPS.filter((step) => progress[step]).length;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.heading}>{t("setup.title")}</Text>
        <Text style={styles.count}>
          {t("setup.progress", {
            done: String(done),
            total: SETUP_STEPS.length,
          })}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round((done / SETUP_STEPS.length) * 100)}%` },
          ]}
        />
      </View>
      {SETUP_STEPS.map((step) => (
        <StepRow
          key={step}
          step={step}
          done={progress[step]}
          onPress={
            step === "paste" && !progress.paste
              ? () => router.push("/add")
              : undefined
          }
        />
      ))}
      {onDismiss ? (
        <GhostButton label={t("common.notNow")} onPress={onDismiss} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.gap(1.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.gap(1),
  },
  heading: {
    ...theme.type.headline,
    fontSize: 20,
    color: theme.colors.foreground,
  },
  count: {
    ...theme.type.label,
    color: theme.colors.muted,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  row: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  tile: {
    minWidth: 40,
    minHeight: 40,
    padding: theme.gap(0.5),
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  emoji: {
    fontSize: 20,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...theme.type.subheadStrong,
    color: theme.colors.foreground,
  },
  titleDone: {
    color: theme.colors.muted,
    textDecorationLine: "line-through",
  },
  body: {
    ...theme.type.caption,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  markOn: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
}));
