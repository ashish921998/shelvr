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
  const sendingRef = useRef(false);
  const openedRef = useRef(false);

  const available = user !== null;

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    feedbackAnalytics.feedbackOpened(surface);
  }, [surface]);

  const canSend = flow !== "sending" && !!user && message.trim().length > 0;

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
        analytics.capture("feedback_submitted", {
          surface,
          char_count: message.length,
          delivery: deliveryState,
        });
        return "accepted";
      } catch {
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
    gap: theme.gap(1),
    marginTop: theme.gap(1),
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
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
    flex: 1,
    minHeight: 48,
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
