import { t, useAppLocale } from "@/lib/i18n";
import type { DemoKind, DemoSample } from "@/lib/onboarding-demo";
import type { Interest } from "@/lib/onboarding-interests";
import { AppSymbolIcon } from "@/components/symbol";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The ready-made sample cards onboarding shows: the first-save picker, the
// sign-in prompt after its preview, and the share-sheet practice.

const APP_ICON = require("../../../assets/icon.png");
const SAMPLE_IMAGES: Record<DemoKind, number> = {
  Articles: require("../../../assets/onboarding/demo-article.jpg"),
  Recipes: require("../../../assets/onboarding/demo-recipe.jpg"),
  Products: require("../../../assets/onboarding/demo-product.jpg"),
  Travel: require("../../../assets/onboarding/demo-travel.jpg"),
  Videos: require("../../../assets/onboarding/topic-talk.jpg"),
};
// Each topic's picture. The topic photos are from Unsplash, under its free
// licence.
const INTEREST_IMAGES: Record<Interest, number> = {
  AI: require("../../../assets/onboarding/topic-ai.jpg"),
  Tech: require("../../../assets/onboarding/topic-tech.jpg"),
  Startups: require("../../../assets/onboarding/topic-startups.jpg"),
  Business: require("../../../assets/onboarding/topic-business.jpg"),
  Money: require("../../../assets/onboarding/topic-money.jpg"),
  Productivity: require("../../../assets/onboarding/topic-productivity.jpg"),
  Design: require("../../../assets/onboarding/topic-design.jpg"),
  "Interior design": require("../../../assets/onboarding/sofa.jpg"),
  Architecture: require("../../../assets/onboarding/topic-architecture.jpg"),
  Photography: require("../../../assets/onboarding/topic-photography.jpg"),
  Films: require("../../../assets/onboarding/videos.jpg"),
  Anime: require("../../../assets/onboarding/topic-anime.jpg"),
  Music: require("../../../assets/onboarding/topic-music.jpg"),
  Gaming: require("../../../assets/onboarding/topic-gaming.jpg"),
  Books: require("../../../assets/onboarding/book.jpg"),
  Science: require("../../../assets/onboarding/topic-science.jpg"),
  Coffee: require("../../../assets/onboarding/espresso.jpg"),
  Travel: require("../../../assets/onboarding/demo-travel.jpg"),
  Fitness: require("../../../assets/onboarding/fitness.jpg"),
  Wellness: require("../../../assets/onboarding/topic-wellness.jpg"),
};

function sampleImage(sample: DemoSample): number {
  return sample.interest === undefined
    ? SAMPLE_IMAGES[sample.kind]
    : INTEREST_IMAGES[sample.interest];
}

/** An illustration of the share gesture, not a control. */
export function ShareHint() {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <View
      style={styles.hint}
      accessible
      accessibilityLabel={t("demo.shareHelp")}
    >
      <View style={styles.hintArt}>
        <View style={styles.hintShare}>
          <AppSymbolIcon
            name="square.and.arrow.up"
            size={18}
            tintColor={theme.colors.primaryForeground}
          />
        </View>
        <AppSymbolIcon
          name="chevron.right"
          size={12}
          tintColor={theme.colors.faint}
        />
        <Image source={APP_ICON} style={styles.hintIcon} />
      </View>
      <Text style={styles.hintText}>{t("demo.shareHelp")}</Text>
    </View>
  );
}

/** A large sample card. "save" saves it in one tap; "share" opens the real
 * share sheet over it, so the save goes through the Shelvr tile; "preview"
 * only shows it. */
export function SampleCard({
  sample,
  action,
  disabled,
  onPress,
}: {
  sample: DemoSample;
  action: "save" | "share" | "preview";
  disabled: boolean;
  onPress?: () => void;
}) {
  const { theme } = useUnistyles();
  const share = action === "share";
  const preview = action === "preview";
  return (
    <Pressable
      accessibilityRole={preview ? undefined : "button"}
      accessibilityLabel={
        preview
          ? `${sample.pageHeading}, ${sample.domain}`
          : `${t(share ? "demo.shareThis" : "demo.save")}, ${sample.pageHeading}, ${sample.domain}`
      }
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.post,
        disabled ? { opacity: 0.4 } : pressed && { opacity: 0.85 },
      ]}
    >
      <Image
        source={sampleImage(sample)}
        contentFit="cover"
        style={styles.postImage}
      />
      <View style={styles.postBody}>
        <View style={styles.linkText}>
          <Text style={styles.postTitle} numberOfLines={2}>
            {sample.pageHeading}
          </Text>
          <Text style={styles.linkUrl} numberOfLines={1}>
            {sample.domain}
          </Text>
        </View>
        {preview ? null : (
          <View style={styles.hintShare}>
            <AppSymbolIcon
              name={share ? "square.and.arrow.up" : "plus"}
              size={18}
              tintColor={theme.colors.primaryForeground}
            />
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function SampleRow({
  sample,
  icon,
  disabled,
  onPress,
}: {
  sample: DemoSample;
  icon: "plus" | "square.and.arrow.up" | "checkmark";
  disabled: boolean;
  onPress?: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sample.pageHeading}, ${sample.domain}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sampleRow,
        disabled ? { opacity: 0.4 } : pressed && { opacity: 0.85 },
      ]}
    >
      <Image
        source={sampleImage(sample)}
        contentFit="cover"
        style={styles.sampleThumb}
      />
      <View style={styles.linkText}>
        <Text style={styles.linkHost} numberOfLines={1}>
          {sample.pageHeading}
        </Text>
        <Text style={styles.linkUrl} numberOfLines={1}>
          {sample.domain}
        </Text>
      </View>
      <AppSymbolIcon name={icon} size={16} tintColor={theme.colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  hintArt: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  hintShare: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  hintIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
  },
  hintText: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: theme.colors.foreground,
  },
  post: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  postImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.primarySoft,
  },
  postBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
  },
  postTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: theme.colors.foreground,
  },
  linkText: {
    flex: 1,
    gap: 2,
  },
  linkHost: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  linkUrl: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.faint,
  },
  sampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    padding: theme.gap(1),
    paddingRight: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  sampleThumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
}));
