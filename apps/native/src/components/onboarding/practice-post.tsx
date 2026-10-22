import { t, useAppLocale } from "@/lib/i18n";
import type { DemoSample } from "@/lib/onboarding-demo";
import { AppSymbolIcon } from "@/components/symbol";
import { sampleImage } from "@/components/onboarding/sample-card";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const APP_ICON = require("../../../assets/icon.png");
const SHARE_SIZE = 40;

export function PracticePost({
  sample,
  disabled,
  onPress,
}: {
  sample: DemoSample;
  disabled: boolean;
  onPress: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("demo.shareThis")}, ${sample.pageHeading}, ${sample.domain}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.post,
        disabled
          ? { opacity: theme.opacity.disabled }
          : pressed && { opacity: theme.opacity.pressed },
      ]}
    >
      <View style={styles.byline}>
        <Image
          source={sampleImage(sample)}
          contentFit="cover"
          style={styles.avatar}
        />
        <Text style={styles.author} numberOfLines={1}>
          {sample.domain}
        </Text>
      </View>
      <Image
        source={sampleImage(sample)}
        contentFit="cover"
        style={styles.image}
      />
      <View style={styles.footer}>
        <Text style={styles.title} numberOfLines={2}>
          {sample.pageHeading}
        </Text>
        <View style={styles.share}>
          <AppSymbolIcon
            name="square.and.arrow.up"
            size={18}
            tintColor={theme.colors.primaryForeground}
          />
        </View>
      </View>
    </Pressable>
  );
}

export function ShareSteps({ active }: { active: 1 | 2 }) {
  useAppLocale();
  return (
    <View style={styles.steps}>
      <View style={[styles.step, active === 1 && styles.stepOn]}>
        <Text style={styles.stepNumber}>1</Text>
        <Text style={styles.stepText}>{t("sharePractice.stepShare")}</Text>
      </View>
      <View style={[styles.step, active === 2 && styles.stepOn]}>
        <Text style={styles.stepNumber}>2</Text>
        <Image source={APP_ICON} style={styles.stepIcon} />
        <Text style={styles.stepText}>{t("sharePractice.stepShelvr")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  post: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  byline: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    paddingVertical: theme.gap(1),
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
  },
  author: {
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  image: {
    width: "100%",
    aspectRatio: 2,
    backgroundColor: theme.colors.primarySoft,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
  },
  title: {
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: theme.colors.foreground,
  },
  share: {
    width: SHARE_SIZE,
    height: SHARE_SIZE,
    borderRadius: SHARE_SIZE / 2,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  steps: {
    flexDirection: "row",
    gap: theme.gap(1),
  },
  step: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    padding: theme.gap(1.25),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  stepOn: {
    borderColor: theme.colors.primary,
  },
  stepNumber: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  stepIcon: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderCurve: "continuous",
  },
  stepText: {
    flexShrink: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
}));
