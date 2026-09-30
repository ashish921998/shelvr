import { t, useAppLocale } from "@/lib/i18n";
import type { TextMessageKey } from "@/locales/message-types";
import { analytics } from "@/lib/analytics";
import { formatItemDate } from "@/lib/date";
import { isPaywallPending, waitForSheetTransition } from "@/lib/entitlement";
import { finishWelcome, useWelcomePending } from "@/lib/welcome-save";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const SHEET_POLL_MS = 250;

const STEPS: TextMessageKey[] = ["home.howToShare", "home.howToPick"];

/**
 * Right after Pro starts: confirm it, then hand off to one real save. The
 * trial line is the real end date from the entitlement. Queued by
 * `useWelcomeSaveTracker`; `ready` holds it until Home owns the screen.
 */
export function WelcomeSaveSheet({
  userId,
  ready,
  trialEndsAt,
}: {
  userId: string;
  ready: boolean;
  trialEndsAt?: number;
}) {
  useAppLocale();
  const router = useRouter();
  const pending = useWelcomePending(userId);
  // A modal only presents from the focused screen: a purchase behind an item
  // or the share screen waits until the user is back on Home.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // iOS cannot present over the RevenueCat sheet. The entitlement can flip
  // while it is still up, so wait for it to close, then for its slide-out.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!pending) return;
    let live = true;
    void (async () => {
      while (live && isPaywallPending()) {
        await new Promise((resolve) => setTimeout(resolve, SHEET_POLL_MS));
      }
      await waitForSheetTransition();
      if (live) setSettled(true);
    })();
    return () => {
      live = false;
    };
  }, [pending]);
  const visible = pending && ready && focused && settled;
  const trial = trialEndsAt !== undefined;

  const shownRef = useRef(false);
  useEffect(() => {
    if (!visible || shownRef.current) return;
    shownRef.current = true;
    analytics.capture("welcome_save_shown", { trial });
  }, [visible, trial]);

  const finish = (action: "save" | "dismiss") => {
    finishWelcome(userId);
    analytics.capture("welcome_save_action", { action, trial });
  };

  const close = () => finish("dismiss");
  const save = () => {
    finish("save");
    // Pushing the add sheet while this modal slides away drops it on iOS.
    void waitForSheetTransition().then(() => router.push("/add"));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.scrim}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("common.notNow")}
        />
        <View style={styles.sheet} testID="welcome-save-sheet">
          <View style={styles.grabber} />
          <Text style={styles.title}>{t("welcome.title")}</Text>
          <Text style={styles.body}>
            {trial
              ? t("welcome.trialBody", { date: formatItemDate(trialEndsAt) })
              : t("welcome.body")}
          </Text>
          <View style={styles.steps}>
            {STEPS.map((key, index) => (
              <View key={key} style={styles.step}>
                <View style={styles.number}>
                  <Text style={styles.numberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepTitle}>{t(key)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.actions}>
            <CtaButton label={t("home.progressAdd")} onPress={save} />
            <GhostButton label={t("common.notNow")} onPress={close} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(2),
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.background,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginBottom: theme.gap(1),
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    lineHeight: 30,
    color: theme.colors.foreground,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  steps: {
    gap: theme.gap(1.25),
    marginTop: theme.gap(0.5),
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  stepTitle: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  actions: {
    gap: theme.gap(0.5),
    marginTop: theme.gap(1),
  },
}));
