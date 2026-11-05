import { PillButton } from "@/components/onboarding/parts";
import { t, useAppLocale } from "@/lib/i18n";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import type { TextMessageKey } from "@/locales/message-types";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function StatementStep({
  text,
  cta,
  centered,
  onContinue,
  children,
}: {
  text: string;
  cta?: TextMessageKey;
  centered?: boolean;
  onContinue: () => void;
  children?: ReactNode;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      {children}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.middle}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[styles.text, centered && styles.centered]}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
          accessibilityRole="header"
        >
          {text}
        </Text>
      </ScrollView>
      <PillButton label={t(cta ?? "common.continue")} onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { flex: 1 },
  scroll: { flex: 1 },
  middle: { flexGrow: 1, justifyContent: "center" },
  text: {
    ...theme.type.hero,
    lineHeight: 54,
    letterSpacing: -0.5,
    color: theme.colors.foreground,
  },
  centered: { textAlign: "center" },
}));
