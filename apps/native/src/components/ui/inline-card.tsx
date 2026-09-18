import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/**
 * Shared shell for the dismissible inline cards on Home (feedback
 * invitation, cancel survey): card frame, header, body. Purely
 * presentational — callers own their buttons/options and all state.
 */
export function InlineCard({
  title,
  body,
  testID,
  children,
}: {
  title: string;
  body: string;
  testID: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.body}>{body}</Text>
      {children}
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
}));
