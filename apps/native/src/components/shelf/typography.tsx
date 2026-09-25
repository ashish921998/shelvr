// The type the redesign speaks in. Exposure is for headlines, titles and the
// wordmark only — never a button, a chip or body copy.

import {
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** Bold 11, +1px tracking, uppercase, faint. Labels a section: "Recipes · 14". */
export function Eyebrow({
  children,
  style,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.eyebrow, style]}>{children.toUpperCase()}</Text>;
}

/** The screen-level statement: "Six things waiting, Ana." */
export function Display({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.display, style]}>{children}</Text>;
}

/** "Twenty sorted.", "Onto the shelf." */
export function Headline({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.headline, style]}>{children}</Text>;
}

/** The screen's one gutter. Content sits 20 in from each edge. */
export function Gutter({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.gutter, style]}>{children}</View>;
}

const styles = StyleSheet.create((theme) => ({
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: theme.colors.faint,
  },
  display: {
    fontFamily: theme.fonts.display,
    fontSize: 46,
    lineHeight: 50,
    color: theme.colors.foreground,
  },
  headline: {
    fontFamily: theme.fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: theme.colors.foreground,
  },
  gutter: { paddingHorizontal: 20 },
}));
