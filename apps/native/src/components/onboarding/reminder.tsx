import { NotificationPreview } from "@/components/notification-preview";
import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import {
  GhostButton,
  PillButton,
  QuestionTitle,
  ScalePressable,
} from "@/components/onboarding/parts";
import type { SampleCityId } from "@/lib/sample-cities";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { requestNotificationPermission } from "@/lib/notification-token";
import { useNotificationSession } from "@/lib/notifications";
import {
  applyQueuedWeeklyShelf,
  queueWeeklyShelf,
} from "@/lib/pending-weekly-shelf";
import {
  TRIAL_REMINDER_LEAD_DAYS,
  setTrialReminderLeadDays,
  trialReminderLeadDays,
  type TrialReminderLeadDays,
} from "@/lib/trial-reminder";
import { useConvexAuth } from "convex/react";
import { Image } from "expo-image";
import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

function LeadChoice({
  days,
  selected,
  onPress,
}: {
  days: TrialReminderLeadDays;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <ScalePressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceOn]}
    >
      <Text style={styles.choiceLabel}>
        {t("reminderStep.daysBefore", { count: days })}
      </Text>
    </ScalePressable>
  );
}

/** Asks for notifications as a trial reminder, and keeps how many days ahead it should come. */
export function ReminderStep({
  city,
  leaving,
  onDone,
}: {
  /** The sample's city, behind the mock notification. */
  city: SampleCityId;
  leaving: boolean;
  onDone: () => void;
}) {
  useAppLocale();
  const { isAuthenticated } = useConvexAuth();
  const { session } = useNotificationSession();
  const [lead, setLead] = useState(trialReminderLeadDays);
  const [asking, setAsking] = useState(false);
  // State updates too late to stop a second tap before the next render.
  const inFlight = useRef(false);
  const reported = useRef(false);

  // Not latched: a closed paywall leaves them here to move on again.
  const finish = (action: "allow" | "skip", granted: boolean) => {
    if (!reported.current) {
      reported.current = true;
      analytics.capture("onboarding_notifications", { action, granted });
    }
    onDone();
  };

  const allow = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAsking(true);
    setTrialReminderLeadDays(lead);
    let granted = false;
    try {
      granted = await requestNotificationPermission();
      if (granted) {
        queueWeeklyShelf();
        // Already signed in, so no sign-in is coming to apply it.
        if (isAuthenticated) {
          await applyQueuedWeeklyShelf((enabled) =>
            session.setWeeklyShelf(enabled),
          );
        }
      }
    } catch (error) {
      analytics.captureError("onboarding_notifications_failed", error);
    }
    inFlight.current = false;
    setAsking(false);
    finish("allow", granted);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.wordmark}>shelvr</Text>
        <QuestionTitle
          title={t("reminderStep.title")}
          body={t("reminderStep.body")}
        />
        <View style={styles.scene}>
          <Image
            source={CITY_PICTURES[city].view}
            contentFit="cover"
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.art} accessibilityElementsHidden>
            📅
          </Text>
          <NotificationPreview
            frosted
            title={t("reminderStep.previewTitle")}
            body={t("reminderStep.previewBody")}
            when={t("reminderStep.now")}
          />
        </View>
        <View style={styles.choices}>
          {TRIAL_REMINDER_LEAD_DAYS.map((days) => (
            <LeadChoice
              key={days}
              days={days}
              selected={lead === days}
              onPress={() => setLead(days)}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.foot}>
        <PillButton
          label={t("common.continue")}
          onPress={() => void allow()}
          busy={asking || leaving}
        />
        <GhostButton
          label={t("common.notNow")}
          onPress={() => finish("skip", false)}
          disabled={asking || leaving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(1),
  },
  scroll: {
    flex: 1,
  },
  body: {
    gap: theme.gap(2.5),
    paddingBottom: theme.gap(2),
  },
  wordmark: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.colors.primaryText,
  },
  scene: {
    justifyContent: "space-between",
    gap: theme.gap(2),
    padding: theme.gap(1.5),
    paddingTop: theme.gap(3),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  art: {
    fontSize: 56,
    textAlign: "center",
  },
  choices: {
    flexDirection: "row",
    gap: theme.gap(1),
  },
  choice: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: theme.control.minHeight,
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(0.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  choiceOn: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  choiceLabel: {
    ...theme.type.subheadStrong,
    textAlign: "center",
    color: theme.colors.foreground,
  },
  foot: {
    gap: theme.gap(0.5),
  },
}));
