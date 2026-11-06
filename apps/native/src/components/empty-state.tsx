import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { fadeIn } from "@/lib/motion";

type Props = {
  title: string;
  message: string;
  animateEntrance?: boolean;
  children?: ReactNode;
};

export function EmptyState({
  title,
  message,
  animateEntrance = true,
  children,
}: Props) {
  return (
    <Animated.View
      entering={animateEntrance ? fadeIn : undefined}
      style={styles.container}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {children ? <View style={styles.action}>{children}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.gap(4),
    paddingBottom: rt.insets.bottom + theme.gap(2),
    gap: theme.gap(1),
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.foreground,
  },
  message: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.muted,
    textAlign: "center",
    lineHeight: 21,
  },
  action: {
    marginTop: theme.gap(1),
  },
}));
