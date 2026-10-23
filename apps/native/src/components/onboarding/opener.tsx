import { PhotoCollage } from "@/components/onboarding/collage";
import { PillButton } from "@/components/onboarding/parts";
import { t, useAppLocale } from "@/lib/i18n";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function OpenerStep({
  onStart,
  onSignIn,
}: {
  onStart: () => void;
  onSignIn: () => void;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      <PhotoCollage />
      <View style={styles.copy}>
        <Text
          style={styles.wordmark}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
          accessibilityRole="header"
        >
          shelvr
        </Text>
        <Text style={styles.tagline} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
          {t("opener.tagline")}
        </Text>
      </View>
      <View style={styles.foot}>
        <PillButton label={t("opener.getStarted")} onPress={onStart} />
        <Pressable
          accessibilityRole="button"
          onPress={onSignIn}
          style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
        >
          <Text style={styles.signInText}>
            {t("onboarding.haveAccount")}{" "}
            <Text style={styles.signInLink}>{t("onboarding.signIn")}</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(3),
  },
  copy: {
    gap: theme.gap(1),
  },
  wordmark: {
    fontFamily: theme.fonts.display,
    fontSize: 56,
    lineHeight: 60,
    color: theme.colors.primaryText,
  },
  tagline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
    color: theme.colors.foreground,
  },
  foot: {
    gap: theme.gap(1),
  },
  signIn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
  signInText: {
    ...theme.type.subhead,
    color: theme.colors.muted,
  },
  signInLink: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.primaryText,
  },
}));
