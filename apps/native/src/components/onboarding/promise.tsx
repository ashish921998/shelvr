import { t, useAppLocale } from "@/lib/i18n";
import type { ReminderSlot } from "@/lib/first-save-reminder";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { CtaButton } from "@/components/onboarding/parts";
import type { DemoSaved } from "@/lib/use-demo-save";
import type { TextMessageKey } from "@/locales/message-types";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const REMINDER_LINE: Record<ReminderSlot, TextMessageKey> = {
  tonight: "promise.reminderTonight",
  tomorrow: "promise.reminderTomorrow",
  weekend: "promise.reminderWeekend",
  nextWeek: "promise.reminderNextWeek",
};

/**
 * The last step before the paywall: three habits the person promises
 * themselves, taken with one tap. The middle one names the reminder they set
 * on the notifications step, and only when it was actually scheduled.
 * Nothing is stored or sent.
 */
export function PromiseStep({
  reminder,
  saved,
  spaces,
  leaving,
  onCommit,
}: {
  reminder: ReminderSlot | null;
  /** The first save, when the demo step made one. */
  saved: DemoSaved | null;
  /** The spaces picked earlier in onboarding. */
  spaces: string[];
  /** `onCommit` ran and the paywall is on its way. */
  leaving: boolean;
  onCommit: () => void;
}) {
  useAppLocale();
  const lines: TextMessageKey[] = [
    "promise.share",
    reminder === null ? "promise.comeBack" : REMINDER_LINE[reminder],
    "promise.use",
  ];
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text
          style={styles.headline}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        >
          {t("promise.title")}{" "}
          <Text style={styles.headlineAccent}>{t("promise.titleAccent")}</Text>
        </Text>
        <Recap saved={saved} spaces={spaces} />
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>{t("promise.eyebrow")}</Text>
        {lines.map((line, index) => (
          <View key={line} style={styles.line}>
            <Text style={styles.number}>{index + 1}</Text>
            <Text style={styles.lineText}>{t(line)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.foot}>
        <CtaButton label={t("promise.cta")} onPress={onCommit} busy={leaving} />
        <Text style={styles.note}>{t("promise.note")}</Text>
      </View>
    </View>
  );
}

/**
 * Plays back what the person did before the paywall: where their first save
 * went, or that their spaces are picked. Spaces are only created once
 * onboarding finishes, so nothing here calls the shelf ready.
 */
function Recap({
  saved,
  spaces,
}: {
  saved: DemoSaved | null;
  spaces: string[];
}) {
  const item = useQuery(
    convexQuery(api.items.getItem, saved ? { id: saved.itemId } : "skip"),
  ).data;
  if (saved === null) {
    return (
      <Text style={styles.support}>
        {t(spaces.length > 0 ? "promise.spacesPicked" : "promise.body")}
      </Text>
    );
  }
  const space = saved.savedSpaceNames[0];
  const image = item?.heroImageUrl ?? item?.imageUrl;
  return (
    <View style={styles.recap}>
      {image ? (
        <Image source={image} style={styles.thumb} contentFit="cover" />
      ) : null}
      <Text style={styles.recapText}>
        {space
          ? t("promise.firstSaveIn", { space })
          : t("promise.firstSaveSaved")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(3),
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
  headlineAccent: {
    color: theme.colors.primaryText,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  recap: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    marginTop: theme.gap(0.5),
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  recapText: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  card: {
    gap: theme.gap(1.75),
    padding: theme.gap(2.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  line: {
    flexDirection: "row",
    gap: theme.gap(1.5),
  },
  number: {
    width: 14,
    paddingTop: 5,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  lineText: {
    flex: 1,
    fontFamily: theme.fonts.display,
    fontSize: 21,
    lineHeight: 27,
    color: theme.colors.foreground,
  },
  foot: {
    marginTop: "auto",
    gap: theme.gap(1),
  },
  note: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.muted,
  },
}));
