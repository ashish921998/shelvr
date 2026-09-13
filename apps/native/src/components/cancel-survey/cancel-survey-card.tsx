import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { InlineCard } from "@/components/ui/inline-card";
import {
  CANCEL_REASON_LABELS,
  CANCEL_SURVEY_REASONS,
  type CancelSurveyReason,
} from "@/lib/cancel-survey";

/**
 * The one-time cancel-survey card shown on Home after a trial cancellation is
 * detected (auto-renew off, trial still active). Presentational apart from
 * one signal: `onPresented` fires on mount, because the ask is consumed only
 * when the card actually renders — never when cancellation is merely
 * detected. State and analytics live in useCancelSurvey. Tapping a reason
 * submits it — no separate send step, no free text anywhere.
 */
export function CancelSurveyCard({
  onSubmit,
  onDismiss,
  onPresented,
}: {
  onSubmit: (reason: CancelSurveyReason) => void;
  onDismiss: () => void;
  onPresented: () => void;
}) {
  useEffect(() => {
    onPresented();
  }, [onPresented]);

  return (
    <InlineCard
      testID="cancel-survey-card"
      title="What made you cancel?"
      body="Your trial is still active, but auto-renew is off. One tap helps us understand — it won’t change anything about your subscription."
    >
      <View style={styles.options}>
        {CANCEL_SURVEY_REASONS.map((reason) => (
          <Pressable
            key={reason}
            accessibilityRole="button"
            accessibilityLabel={`Cancel reason: ${CANCEL_REASON_LABELS[reason]}`}
            style={({ pressed }) => [
              styles.option,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => onSubmit(reason)}
          >
            <Text style={styles.optionText}>
              {CANCEL_REASON_LABELS[reason]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Skip cancel survey"
        style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}
        onPress={onDismiss}
      >
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </InlineCard>
  );
}

const styles = StyleSheet.create((theme) => ({
  options: {
    gap: theme.gap(1),
    marginTop: theme.gap(0.5),
  },
  option: {
    minHeight: 44,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.gap(2),
    alignItems: "flex-start",
    justifyContent: "center",
  },
  optionText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  skip: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
}));
