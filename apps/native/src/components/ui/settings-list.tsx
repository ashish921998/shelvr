import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** A bordered card that stacks settings rows with hairline dividers. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

/**
 * One tappable row in a SettingsGroup: a label, an optional current value,
 * and a trailing symbol. Without `onPress` it renders as plain content, which
 * lets a native menu wrap it and own the tap.
 */
export function SettingsRow({
  label,
  value,
  icon = "chevron.right",
  onPress,
  disabled,
  divider = true,
  accessibilityLabel,
  testID,
}: {
  label: string;
  value?: string;
  icon?: AppSymbolName;
  onPress?: () => void;
  disabled?: boolean;
  /** Draws the hairline above this row; the first row in a group omits it. */
  divider?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const content = (
    <>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.trailing}>
        {value ? (
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        <AppSymbolIcon
          name={icon}
          size={icon === "chevron.right" ? 16 : 14}
          tintColor={theme.colors.muted}
        />
      </View>
    </>
  );
  if (!onPress)
    return (
      <View style={[styles.row, divider && styles.divider]}>{content}</View>
    );
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && styles.divider,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.4 },
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  group: {
    alignSelf: "stretch",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1),
    minHeight: 48,
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(1.5),
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  label: {
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    flexShrink: 1,
  },
  value: {
    flexShrink: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.muted,
  },
}));
