import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { AppSymbolIcon } from "@/components/symbol";
import type { AhaSample } from "@/lib/aha-sample";
import { t } from "@/lib/i18n";
import { SAMPLE_CITIES } from "@/lib/sample-cities";
import type { PlanKind } from "@/lib/sample-plans";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const CAPTIONS: Record<
  PlanKind,
  "aha.captionDate" | "aha.captionTrip" | "aha.captionWeekend"
> = {
  date: "aha.captionDate",
  trip: "aha.captionTrip",
  weekend: "aha.captionWeekend",
};

function reelCaption(sample: AhaSample): string {
  return t(CAPTIONS[sample.kind], {
    city: t(SAMPLE_CITIES[sample.city].name),
  });
}

function reelPicture(sample: AhaSample): number {
  return CITY_PICTURES[sample.city][sample.kind === "trip" ? "view" : "food"];
}

const RAIL = [
  "heart.fill",
  "bubble.right.fill",
  "square.and.arrow.up.fill",
] as const;

/** A made-up vertical video post, labelled a sample. `thumb` is the small copy shown once it is read. */
export function AhaReel({
  sample,
  thumb = false,
}: {
  sample: AhaSample;
  thumb?: boolean;
}) {
  const caption = reelCaption(sample);
  return (
    <View
      style={[styles.reel, thumb && styles.thumb]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${sample.handle}: ${caption}`}
    >
      <Image
        source={reelPicture(sample)}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.scrim} />
      {thumb ? null : (
        <>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t("aha.sampleBadge")}</Text>
          </View>
          <View style={styles.rail}>
            {RAIL.map((name) => (
              <AppSymbolIcon
                key={name}
                name={name}
                size={24}
                tintColor="#FFFFFF"
              />
            ))}
          </View>
          <View style={styles.foot}>
            <Text style={styles.handle}>{sample.handle}</Text>
            <Text style={styles.caption} numberOfLines={3}>
              {caption}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  reel: {
    flex: 1,
    minHeight: 240,
    maxWidth: 340,
    width: "100%",
    alignSelf: "center",
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  thumb: {
    flex: 0,
    minHeight: 0,
    width: 56,
    height: 84,
    borderRadius: theme.radius.sm,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    experimental_backgroundImage:
      "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0) 60%)",
  },
  badge: {
    position: "absolute",
    top: theme.gap(1.5),
    left: theme.gap(1.5),
    paddingVertical: 3,
    paddingHorizontal: theme.gap(1),
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  badgeText: {
    ...theme.type.captionStrong,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#FFFFFF",
  },
  // The share sheet covers the lower half, so the post's text sits up top.
  rail: {
    position: "absolute",
    right: theme.gap(1.5),
    top: theme.gap(7),
    gap: theme.gap(2.5),
    alignItems: "center",
  },
  foot: {
    position: "absolute",
    left: theme.gap(2),
    right: theme.gap(7),
    top: theme.gap(6),
    gap: theme.gap(0.5),
  },
  handle: {
    ...theme.type.subheadStrong,
    color: "#FFFFFF",
  },
  caption: {
    ...theme.type.footnote,
    lineHeight: 19,
    color: "#FFFFFF",
  },
}));
