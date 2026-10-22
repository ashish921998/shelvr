import { t } from "@/lib/i18n";
import type { DemoKind, DemoSample } from "@/lib/onboarding-demo";
import type { Interest } from "@/lib/onboarding-interests";
import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { AppSymbolIcon } from "@/components/symbol";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The ready-made sample cards onboarding shows: the first-save picker and the
// share-sheet practice.

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
  Travel: require("../../../assets/onboarding/demo-travel.jpg"),
  "Food & recipes": require("../../../assets/onboarding/demo-recipe.jpg"),
  "Home & design": require("../../../assets/onboarding/sofa.jpg"),
  "Style & shopping": require("../../../assets/onboarding/demo-product.jpg"),
  "Fitness & wellness": require("../../../assets/onboarding/fitness.jpg"),
  "AI & tech": require("../../../assets/onboarding/topic-ai.jpg"),
  "Business & productivity": require("../../../assets/onboarding/topic-business.jpg"),
  "Films, books & music": require("../../../assets/onboarding/book.jpg"),
};

export function sampleImage(sample: DemoSample): number {
  // A picked city's travel sample shows that city.
  if (sample.city !== undefined) return CITY_PICTURES[sample.city].view;
  return sample.interest === undefined
    ? SAMPLE_IMAGES[sample.kind]
    : INTEREST_IMAGES[sample.interest];
}

/** A large sample card. "save" saves it in one tap; "share" opens the real
 * share sheet over it, so the save goes through the Shelvr tile. */
export function SampleCard({
  sample,
  action,
  disabled,
  onPress,
}: {
  sample: DemoSample;
  action: "save" | "share";
  disabled: boolean;
  onPress?: () => void;
}) {
  const { theme } = useUnistyles();
  const share = action === "share";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t(share ? "demo.shareThis" : "demo.save")}, ${sample.pageHeading}, ${sample.domain}`}
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
        <View style={styles.hintShare}>
          <AppSymbolIcon
            name={share ? "square.and.arrow.up" : "plus"}
            size={18}
            tintColor={theme.colors.primaryForeground}
          />
        </View>
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
  hintShare: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
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
