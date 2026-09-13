import { t, useAppLocale } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
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
import { AppSymbolIcon } from "@/components/symbol";
import { useCurrentUser } from "@/lib/current-user";
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  feedbackAnalytics,
  markFeedbackSubmitted,
  type FeedbackSurface,
} from "@/lib/feedback";
import { SUPPORT_URL } from "@/lib/legal";

type Phase = "compose" | "queued" | "error";

/**
 * The one feedback form, reused by the Home invitation and the permanent
 * Profile entry. Callers conditionally mount it (open = mounted), so compose
 * state resets naturally on close. Nothing is published until the user taps
 * Send; the typed message is masked in session replays via the global posthog
 * config (maskAllTextInputs in lib/posthog.ts). Success is reported honestly —
 * the capture is queued locally, never presented as server-acknowledged.
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
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("compose");
  const openedRef = useRef(false);

  const analyticsAvailable = feedbackAnalytics.isAvailable();
  // A resolved-but-null user has no account to record the send against, so
  // the form offers the support channel instead of a Send that does nothing.
  const available = analyticsAvailable && user !== null;

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    feedbackAnalytics.feedbackOpened(surface);
  }, [surface]);

  // Wait for the user id so a queued send is always recorded against the account.
  const canSend = !sending && !!user && message.trim().length > 0;

  const send = async () => {
    if (sendingRef.current || !user) return;
    const trimmed = message.trim();
    if (trimmed.length === 0) return;
    sendingRef.current = true;
    setSending(true);
    const result = await feedbackAnalytics.submitFeedback(surface, trimmed);
    if (result === "queued") {
      markFeedbackSubmitted(user._id);
    }
    setSending(false);
    sendingRef.current = false;
    // 'unavailable' is honest too: without analytics there is nothing to
    // queue, so the form offers the support channel instead of pretending.
    if (result === "queued") setPhase("queued");
    else setPhase("error");
  };

  const openSupport = () => {
    void Linking.openURL(SUPPORT_URL);
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
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.title} accessibilityRole="header">
              {t("feedback.open")}
            </Text>

            {phase === "queued" ? (
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
            ) : phase === "error" || !available ? (
              <>
                <Text style={styles.body}>
                  {available
                    ? t("feedback.sendFailedContact")
                    : t("feedback.unavailableContact")}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t("support.email")}
                  style={({ pressed }) => [
                    styles.supportRow,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={openSupport}
                >
                  <Text style={styles.supportText}>{t("support.contact")}</Text>
                  <AppSymbolIcon
                    name="arrow.up.right"
                    size={14}
                    tintColor={theme.colors.muted}
                  />
                </Pressable>
                {available ? (
                  <View style={styles.buttonRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("common.close")}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={onClose}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {t("common.close")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.body}>{t("feedback.prompt")}</Text>
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
                    disabled={sending}
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
                      {sending ? t("feedback.sending") : t("feedback.send")}
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
