import { t, useAppLocale } from "@/lib/i18n";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";

// One quiet row above search: the row opens the feedback sheet, the × dismisses.
export function FeedbackInvitation({
  onSendFeedback,
  onDismiss,
}: {
  onSendFeedback: () => void;
  onDismiss: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <View style={styles.row} testID="feedback-invitation">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("feedback.invitationTitle")} ${t("feedback.open")}`}
        style={({ pressed }) => [
          styles.open,
          pressed && { opacity: theme.opacity.pressed },
        ]}
        onPress={onSendFeedback}
      >
        <View style={styles.icon}>
          <AppSymbolIcon
            name="bubble.right.fill"
            size={15}
            tintColor={theme.colors.primaryText}
          />
        </View>
        <View style={styles.text}>
          <ThemedText variant="subheadStrong" numberOfLines={1}>
            {t("feedback.invitationTitle")}
          </ThemedText>
          <View style={styles.action}>
            <ThemedText variant="label" style={styles.actionText}>
              {t("feedback.open")}
            </ThemedText>
            <AppSymbolIcon
              name="chevron.right"
              size={11}
              weight="semibold"
              tintColor={theme.colors.primaryText}
            />
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("feedback.dismissInvitation")}
        hitSlop={8}
        style={({ pressed }) => [
          styles.dismiss,
          pressed && { opacity: theme.opacity.pressed },
        ]}
        onPress={onDismiss}
      >
        <AppSymbolIcon
          name="xmark"
          size={13}
          weight="semibold"
          tintColor={theme.colors.muted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  open: {
    flex: 1,
    minHeight: theme.control.minHeight + theme.gap(1),
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1),
    paddingLeft: theme.gap(1.5),
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    gap: 2,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.5),
  },
  actionText: {
    color: theme.colors.primaryText,
  },
  dismiss: {
    width: theme.control.minHeight,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
}));
