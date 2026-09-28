import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { openExitOffer } from "@/lib/entitlement";
import {
  exitOfferReminderAt,
  exitOfferReminderPending,
  formatCountdown,
} from "@/lib/exit-offer";
import {
  optInToExitOfferReminder,
  optOutOfExitOfferReminder,
  useExitOfferReminderOptIn,
} from "@/lib/exit-offer-reminder";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/**
 * Takes the Pro card's place while the exit offer's 24-hour window is open.
 * The countdown is real: at zero the offer is gone (see `exit-offer.ts`).
 * The reminder is opt-in only (see `exit-offer-reminder.ts`).
 */
export function ExitOfferCard({
  endsAt,
  userId,
}: {
  endsAt: number;
  userId?: string;
}) {
  useAppLocale();
  const router = useRouter();
  const optedIn = useExitOfferReminderOptIn(userId, endsAt);
  const [denied, setDenied] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t("exitOffer.title")}</Text>
        <Text style={styles.countdown}>
          {t("exitOffer.endsIn", { time: formatCountdown(endsAt - now) })}
        </Text>
      </View>
      <CtaButton
        label={t("exitOffer.cta")}
        onPress={() => void openExitOffer(router)}
      />
      {userId && optedIn && exitOfferReminderPending(endsAt, now) ? (
        <View style={styles.reminder}>
          <Text style={styles.note}>{t("exitOffer.reminderSet")}</Text>
          <GhostButton
            label={t("exitOffer.reminderCancel")}
            onPress={() => optOutOfExitOfferReminder(userId)}
          />
        </View>
      ) : null}
      {userId && !optedIn && exitOfferReminderAt(endsAt, now) !== null ? (
        <View style={styles.reminder}>
          <GhostButton
            label={t("exitOffer.remindMe")}
            onPress={() =>
              void optInToExitOfferReminder(userId, endsAt)
                .catch((error) => {
                  analytics.captureError("exit_offer_reminder_failed", error);
                  return false;
                })
                .then((ok) => setDenied(!ok))
            }
          />
          <Text style={styles.note}>
            {t(
              denied ? "exitOffer.reminderDenied" : "exitOffer.reminderConsent",
            )}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.gap(2),
    padding: theme.gap(2.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  head: {
    gap: theme.gap(0.5),
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.foreground,
  },
  reminder: {
    alignItems: "center",
    gap: theme.gap(0.5),
  },
  note: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
    textAlign: "center",
  },
  countdown: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
    fontVariant: ["tabular-nums"],
  },
}));
