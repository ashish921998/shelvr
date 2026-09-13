import { Text, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { InlineCard } from "@/components/ui/inline-card";

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
    <InlineCard
      testID="feedback-invitation"
      title="How’s Shelvr so far?"
      body="Tell us what’s working and what could be better."
    >
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
    </InlineCard>
  );
}

const styles = StyleSheet.create((theme) => ({
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
