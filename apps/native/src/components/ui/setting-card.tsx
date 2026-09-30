import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ThemedText } from "@/components/ui/themed-text";

type Action = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
};

type Props = {
  title: string;
  description?: string;
  /** A control that sits beside the copy, such as a Switch. */
  accessory?: ReactNode;
  /** A text action under the copy. */
  action?: Action;
  /** A status line under the action, announced when it changes. */
  note?: string | null;
};

/**
 * The settings row on Profile: a bordered card with a bold title, a muted
 * description, and either an inline control or a text action below. Settings
 * use this instead of the capsule Button, which is for a screen's main action.
 */
export function SettingCard({
  title,
  description,
  accessory,
  action,
  note,
}: Props) {
  const copy = (
    <View style={[styles.copy, accessory ? styles.copyInline : null]}>
      <ThemedText variant="subheadStrong" style={styles.title}>
        {title}
      </ThemedText>
      {description ? (
        <ThemedText variant="caption" style={styles.description}>
          {description}
        </ThemedText>
      ) : null}
    </View>
  );

  if (accessory) {
    return (
      <View style={[styles.card, styles.inline]}>
        {copy}
        {accessory}
      </View>
    );
  }

  const inactive = !!action?.disabled || !!action?.busy;
  return (
    <View style={styles.card}>
      {copy}
      {action ? (
        <Pressable
          testID={action.testID}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: inactive, busy: !!action.busy }}
          disabled={inactive}
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.action,
            pressed && styles.pressed,
            inactive && styles.disabled,
          ]}
        >
          <ThemedText variant="subheadStrong" style={styles.actionLabel}>
            {action.label}
          </ThemedText>
        </Pressable>
      ) : null}
      {note ? (
        <ThemedText
          variant="caption"
          accessibilityRole="alert"
          style={styles.description}
        >
          {note}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    alignSelf: "stretch",
    gap: theme.gap(1),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  copy: {
    gap: theme.gap(0.25),
  },
  copyInline: {
    flex: 1,
  },
  title: {
    color: theme.colors.foreground,
  },
  description: {
    lineHeight: 18,
    color: theme.colors.muted,
  },
  action: {
    minHeight: theme.control.minHeight,
    justifyContent: "center",
  },
  // primaryText, not primary: the amber fill fails AA as text on the surface.
  actionLabel: {
    color: theme.colors.primaryText,
  },
  pressed: { opacity: theme.opacity.pressed },
  disabled: { opacity: theme.opacity.disabled },
}));
