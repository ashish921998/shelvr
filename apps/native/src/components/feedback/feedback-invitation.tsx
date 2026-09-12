import { Text, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/**
 * The dismissible inline feedback invitation shown on Home once per account
 * (at most twice with a 14-day gap — capped in lib/feedback.ts). Purely
 * presentational; state and analytics live in the hook that mounts it.
 */
export function FeedbackInvitation({
  onSendFeedback,
  onDismiss,
}: {
  onSendFeedback: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.card} testID="feedback-invitation">
      <Text style={styles.title} accessibilityRole="header">
        How’s Shelvr so far?
      </Text>
      <Text style={styles.body}>
        Tell us what’s working and what could be better.
      </Text>
      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send feedback"
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onSendFeedback}
        >
          <Text style={styles.primaryButtonText}>Send feedback</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss feedback invitation"
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onDismiss}
        >
          <Text style={styles.secondaryButtonText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    alignSelf: "stretch",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.gap(2),
    gap: theme.gap(1),
    marginHorizontal: theme.gap(2),
    marginTop: theme.gap(1),
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.gap(1),
    marginTop: theme.gap(0.5),
  },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.primaryForeground,
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
}));
