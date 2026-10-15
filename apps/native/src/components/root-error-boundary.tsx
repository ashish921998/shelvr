import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/**
 * Root render-crash boundary. Reports the exception to error tracking and
 * offers a retry (which remounts the route tree) instead of Expo's bare
 * default screen. Nested routes without their own boundary land here.
 * Re-exported as `ErrorBoundary` from `src/app/_layout.tsx`, where Expo
 * Router picks it up.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useAppLocale();
  useEffect(() => {
    analytics.captureError("render_error", error);
  }, [error]);

  return (
    <View style={errorBoundaryStyles.container}>
      <Text style={errorBoundaryStyles.title}>
        {t("errors.unexpectedTitle")}
      </Text>
      <Text style={errorBoundaryStyles.message}>
        {t("errors.unexpectedBody")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={({ pressed }) => [
          errorBoundaryStyles.retry,
          pressed && errorBoundaryStyles.retryPressed,
        ]}
      >
        <Text style={errorBoundaryStyles.retryLabel}>
          {t("common.tryAgain")}
        </Text>
      </Pressable>
    </View>
  );
}

const errorBoundaryStyles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
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
  retry: {
    marginTop: theme.gap(2),
    borderRadius: 24,
    backgroundColor: theme.colors.foreground,
    paddingHorizontal: theme.gap(3),
    paddingVertical: theme.gap(1.5),
  },
  retryPressed: { opacity: 0.75 },
  retryLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.background,
  },
}));
