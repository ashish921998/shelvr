import { t, useAppLocale } from "@/lib/i18n";
import Constants from "expo-constants";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { AppSymbolIcon } from "@/components/symbol";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  feedbackAnalytics,
  markFeedbackSubmitted,
  sanitizeFeedbackMessage,
  type FeedbackSurface,
} from "@/lib/feedback";
import { SUPPORT_URL } from "@/lib/legal";

/** Bounded app context for the support reply, supplied as bounded values the
 * backend re-validates (platform is a closed union; the version strings are
 * capped server-side). Never user content. */
function submissionContext() {
  const version = Constants.expoConfig?.version;
  const variant = Constants.expoConfig?.extra?.variant;
  return {
    ...(Platform.OS === "ios" || Platform.OS === "android"
      ? { platform: Platform.OS }
      : {}),
    ...(typeof version === "string" && version.length > 0
      ? { appVersion: version }
      : {}),
    ...(variant !== undefined && variant !== null
      ? { buildVariant: String(variant) }
      : {}),
  };
}

/**
 * The one feedback form, reused by the Home invitation and the permanent
 * Profile entry. Callers conditionally mount it (open = mounted), so compose
 * state resets naturally on close. Nothing is sent until the user taps Send;
 * the typed message goes to Convex (never PostHog) and is masked in session
 * replays via the global posthog config (maskAllTextInputs in lib/posthog.ts).
 * Success is reported honestly: "accepted" means Convex persisted the row —
 * inbox delivery is a server-side projection the client never claims as sent.
 * A failed send keeps the draft on screen with the support channel offered.
 */
export function FeedbackModal({
  surface,
  onClose,
}: {
  surface: FeedbackSurface;
  onClose: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const { data: user } = useCurrentUser();
  const submitFeedback = useMutation(api.feedback.submitFeedback);
  const [message, setMessage] = useState("");
  const [flow, setFlow] = useState<"idle" | "sending" | "failed" | "sent">(
    "idle",
  );
  // Mirror of `flow` that survives the async submit gap, so a double-tap
  // cannot start two sends before the state update lands.
  const sendingRef = useRef(false);
  const openedRef = useRef(false);

  // A resolved-but-null user has no account to submit against, so the form
  // offers the support channel instead of a Send that does nothing. Analytics
  // availability is irrelevant here — feedback goes to Convex, not PostHog.
  const available = user !== null;

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    feedbackAnalytics.feedbackOpened(surface);
  }, [surface]);

  // Wait for the user id so a send is always recorded against the account.
  const canSend = flow !== "sending" && !!user && message.trim().length > 0;

  /** Send through Convex. "accepted" means ONLY that Convex persisted the
   * submission — the support inbox email is a server-side projection the
   * client never claims as sent. Any failure (offline, validation, rate
   * limit) returns "failed" so the draft stays editable and the support
   * channel is offered; nothing is captured beyond the bounded shape
   * metadata, and the invitation is only marked submitted on success. */
  const sendFeedback = useCallback(
    async (rawMessage: string): Promise<"accepted" | "failed"> => {
      const message = sanitizeFeedbackMessage(rawMessage);
      if (!message) return "failed";
      try {
        const { deliveryState } = await submitFeedback({
          message,
          surface,
          ...submissionContext(),
        });
        // Capture the content-free projection state only after Convex
        // acknowledges the row is durable: surface, char count, and the
        // delivery category — never the message.
        analytics.capture("feedback_submitted", {
          surface,
          char_count: message.length,
          delivery: deliveryState,
        });
        return "accepted";
      } catch {
        // A raw Convex error can carry server text in its stack, and
        // captureError ships the stack to PostHog. The stable event name is
        // the triage signal; the failure details stay client-side.
        analytics.captureError(
          "feedback_submit_failed",
          new Error("Feedback submission failed"),
        );
        return "failed";
      }
    },
    [submitFeedback, surface],
  );

  const send = async () => {
    if (sendingRef.current || !user) return;
    const trimmed = message.trim();
    if (trimmed.length === 0) return;
    sendingRef.current = true;
    setFlow("sending");
    const result = await sendFeedback(trimmed);
    sendingRef.current = false;
    if (result === "accepted") {
      markFeedbackSubmitted(user._id);
      setFlow("sent");
    } else {
      // The draft stays on screen, editable and re-sendable, with the
      // support channel offered — and the invitation is not marked
      // submitted, so nothing pretends the feedback landed.
      setFlow("failed");
    }
  };

  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable
          style={styles.backdropPress}
          onPress={onClose}
          accessibilityLabel={t("feedback.close")}
        />
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.title} accessibilityRole="header">
              {t("feedback.open")}
            </Text>

            {flow === "sent" ? (
              <>
                <Text style={styles.body}>{t("feedback.thanks")}</Text>
                <View style={styles.buttonRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("common.done")}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={onClose}
                  >
                    <Text style={styles.primaryButtonText}>
                      {t("common.done")}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : !available ? (
              <>
                <Text style={styles.body}>
                  {t("feedback.unavailableContact")}
                </Text>
                <SupportLink />
              </>
            ) : (
              <>
                {flow === "failed" ? (
                  <>
                    <Text style={styles.body}>
                      {t("feedback.sendFailedContact")}
                    </Text>
                    <SupportLink />
                  </>
                ) : null}
                <Text style={styles.body}>{t("feedback.prompt")}</Text>
                <Text style={styles.notice}>{t("feedback.replyNotice")}</Text>
                <TextInput
                  accessibilityLabel={t("feedback.messageLabel")}
                  style={styles.input}
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t("feedback.placeholder")}
                  placeholderTextColor={theme.colors.faint}
                  multiline
                  maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
                  autoCapitalize="sentences"
                  autoCorrect
                />
                <Text style={styles.counter}>
                  {message.length}/{FEEDBACK_MESSAGE_MAX_LENGTH}
                </Text>
                <View style={styles.buttonRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("feedback.cancel")}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && { opacity: 0.7 },
                    ]}
                    disabled={flow === "sending"}
                    onPress={onClose}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {t("common.cancel")}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("feedback.open")}
                    accessibilityState={{ disabled: !canSend }}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && { opacity: 0.7 },
                      !canSend && { opacity: 0.4 },
                    ]}
                    disabled={!canSend}
                    onPress={() => void send()}
                  >
                    <Text style={styles.primaryButtonText}>
                      {flow === "sending"
                        ? t("feedback.sending")
                        : t("feedback.send")}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The Contact Support fallback row, shared by the no-account and
 * failed-send states: direct email is the channel that works when the
 * in-app form cannot serve the user. */
function SupportLink() {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t("support.email")}
      style={({ pressed }) => [styles.supportRow, pressed && { opacity: 0.7 }]}
      onPress={() => void Linking.openURL(SUPPORT_URL)}
    >
      <Text style={styles.supportText}>{t("support.contact")}</Text>
      <AppSymbolIcon
        name="arrow.up.right"
        size={14}
        tintColor={theme.colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "flex-end",
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingBottom: theme.gap(3),
    maxHeight: "80%",
  },
  scrollContent: {
    padding: theme.gap(3),
    gap: theme.gap(1.5),
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.colors.foreground,
    marginBottom: theme.gap(0.5),
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.muted,
    marginBottom: theme.gap(1),
  },
  notice: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: theme.colors.faint,
    marginBottom: theme.gap(1),
  },
  input: {
    alignSelf: "stretch",
    minHeight: 120,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.foreground,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 20,
    padding: theme.gap(1.5),
    textAlignVertical: "top",
  },
  counter: {
    alignSelf: "flex-end",
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.faint,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.gap(1),
    marginTop: theme.gap(1),
  },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: theme.gap(3),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.primaryForeground,
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: theme.gap(3),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  supportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.gap(1.5),
    marginBottom: theme.gap(1),
  },
  supportText: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.primaryText,
  },
}));
