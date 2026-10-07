import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import {
  reminderOptions,
  scheduleFirstSaveReminder,
  type ReminderSlot,
} from "@/lib/first-save-reminder";
import {
  notificationPermissionState,
  requestNotificationPermission,
} from "@/lib/notification-token";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import type { DemoSaved } from "@/components/onboarding/live-demo";
import { AppSymbolIcon } from "@/components/symbol";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import type { TextMessageKey } from "@/locales/message-types";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const SLOT_LABEL: Record<ReminderSlot, TextMessageKey> = {
  tonight: "onboarding.remindTonight",
  tomorrow: "onboarding.remindTomorrow",
  weekend: "onboarding.remindWeekend",
  nextWeek: "onboarding.remindNextWeek",
};

const SLOT_CTA: Record<ReminderSlot, TextMessageKey> = {
  tonight: "onboarding.remindCtaTonight",
  tomorrow: "onboarding.remindCtaTomorrow",
  weekend: "onboarding.remindCtaWeekend",
  nextWeek: "onboarding.remindCtaNextWeek",
};

function formatWhen(slot: ReminderSlot, at: Date): string {
  const sameDay = slot === "tonight" || slot === "tomorrow";
  return new Intl.DateTimeFormat(formattingLocale(), {
    ...(sameDay ? {} : { weekday: "short" }),
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Right after the first save, asks when that save should come back. Picking
 * a time is the reason for the OS prompt, and the answer is one local
 * reminder that opens the save. Skipped when there is no save to remind
 * about, or when notifications were refused for good.
 */
export function NotificationsStep({
  saved,
  onAdvance,
}: {
  saved: DemoSaved | null;
  onAdvance: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [options, setOptions] = useState(() => reminderOptions(new Date()));
  const [picked, setPicked] = useState(0);
  const [busy, setBusy] = useState(false);
  // The step leaves once: by its own check on entry, or by one tap. `busy`
  // lands a render later, so a quick second tap must be stopped here too.
  const done = useRef(false);
  const advanceRef = useRef(onAdvance);
  useEffect(() => {
    advanceRef.current = onAdvance;
  });
  const savedRef = useRef(saved);

  const itemQuery = useQuery(
    convexQuery(
      api.items.getItem,
      saved === null ? "skip" : { id: saved.itemId },
    ),
  );
  const item = itemQuery.data;

  useEffect(() => {
    const leave = () => {
      if (done.current) return;
      done.current = true;
      advanceRef.current();
    };
    if (savedRef.current === null) {
      leave();
      return;
    }
    let live = true;
    notificationPermissionState()
      .then((state) => {
        if (live && state === "blocked") leave();
      })
      .catch((error: unknown) => {
        analytics.captureError("onboarding_reminder_failed", error);
        if (live) leave();
      });
    return () => {
      live = false;
    };
  }, []);

  const choice = options[picked];
  const host = hostOf(item?.url);
  const title = item?.title || item?.siteName || host;

  // A choice that passed while the screen sat open (or while the OS prompt
  // waited) is replaced by fresh times instead of being scheduled.
  const expired = () => {
    if (choice.at.getTime() > Date.now()) return false;
    setOptions(reminderOptions(new Date()));
    setPicked(0);
    return true;
  };

  const remind = async () => {
    if (done.current || saved === null || expired()) return;
    done.current = true;
    setBusy(true);
    let granted = false;
    try {
      granted = await requestNotificationPermission();
      if (granted && expired()) {
        done.current = false;
        setBusy(false);
        return;
      }
      if (granted) {
        await scheduleFirstSaveReminder({
          itemId: saved.itemId,
          title: title || t("onboarding.remindFallbackTitle"),
          at: choice.at,
        });
      }
    } catch (error) {
      analytics.captureError("onboarding_reminder_failed", error);
    }
    analytics.capture("onboarding_reminder", {
      action: "remind",
      slot: choice.slot,
      granted,
    });
    setBusy(false);
    advanceRef.current();
  };

  const skip = () => {
    if (done.current) return;
    done.current = true;
    analytics.capture("onboarding_reminder", {
      action: "skip",
      slot: choice.slot,
      granted: false,
    });
    advanceRef.current();
  };

  const image = item?.heroImageUrl ?? item?.imageUrl;
  const tag = item?.tags[0];

  return (
    <View style={styles.wrap}>
      <Text style={styles.headline} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {t("onboarding.remindTitle")}{" "}
        <Text style={styles.headlineAccent}>
          {t("onboarding.remindQuestion")}
        </Text>
      </Text>

      <View style={styles.save}>
        <View style={styles.thumb}>
          {image ? (
            <Image
              source={image}
              style={styles.thumbImage}
              contentFit="cover"
            />
          ) : (
            <AppSymbolIcon
              name="link"
              size={18}
              tintColor={theme.colors.primaryText}
            />
          )}
        </View>
        <View style={styles.saveText}>
          <Text style={styles.saveTitle} numberOfLines={2}>
            {title || t("onboarding.remindFallbackTitle")}
          </Text>
          <Text style={styles.saveMeta} numberOfLines={1}>
            {host
              ? `${host} · ${t("onboarding.remindSavedNow")}`
              : t("onboarding.remindSavedNow")}
          </Text>
          {tag ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("onboarding.remindQuestion")}
        style={styles.options}
      >
        {options.map((option, index) => {
          const active = index === picked;
          return (
            <Pressable
              key={option.slot}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              disabled={busy}
              onPress={() => setPicked(index)}
              style={({ pressed }) => [
                styles.option,
                active && styles.optionActive,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text style={styles.optionLabel}>
                {t(SLOT_LABEL[option.slot])}
              </Text>
              <Text style={styles.optionWhen}>
                {formatWhen(option.slot, option.at)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.foot}>
        {/* The person's own promise. Shelvr schedules nothing for Sundays
            here, so the line promises nothing on the app's side. */}
        <Text style={styles.pledge}>{t("onboarding.remindPledge")}</Text>
        <CtaButton
          label={t(SLOT_CTA[choice.slot])}
          onPress={() => void remind()}
          busy={busy}
        />
        <GhostButton
          label={t("onboarding.remindSkip")}
          onPress={skip}
          disabled={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2.5),
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
  save: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(2),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  thumb: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  saveText: {
    flex: 1,
    gap: theme.gap(0.5),
  },
  saveTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    lineHeight: 21,
    color: theme.colors.foreground,
  },
  saveMeta: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.muted,
  },
  tag: {
    alignSelf: "flex-start",
    marginTop: theme.gap(0.5),
    paddingHorizontal: theme.gap(1.25),
    paddingVertical: theme.gap(0.5),
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted,
  },
  tagText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
  options: {
    gap: theme.gap(1),
  },
  option: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingVertical: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  optionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  optionLabel: {
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  optionWhen: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.muted,
  },
  pledge: {
    fontFamily: theme.fonts.display,
    fontSize: 19,
    lineHeight: 25,
    textAlign: "center",
    color: theme.colors.foreground,
    marginBottom: theme.gap(0.5),
  },
  foot: {
    marginTop: "auto",
    gap: theme.gap(1),
  },
}));
