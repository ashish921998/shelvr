import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { ScalePressable } from "@/components/onboarding/parts";
import { ReelVideo } from "@/components/onboarding/reel-video";
import { Coach } from "@/components/onboarding/share-sheets";
import { AppSymbolIcon } from "@/components/symbol";
import type { AhaSample } from "@/lib/aha-sample";
import { t } from "@/lib/i18n";
import { SAMPLE_CITIES } from "@/lib/sample-cities";
import { Image } from "expo-image";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

function reelPicture(sample: AhaSample): number {
  return CITY_PICTURES[sample.city][sample.kind === "trip" ? "view" : "food"];
}

const SHARE = "square.and.arrow.up.fill";
const RAIL = ["heart.fill", "bubble.right.fill", SHARE] as const;

/** A vertical video post, labelled a sample: the real reel where the city and plan have one, playing over the city photo. `onShare` rings its share button as the thing to tap, and `dimmed` sets it back behind a sheet. */
export function AhaReel({
  sample,
  onShare,
  dimmed = false,
}: {
  sample: AhaSample;
  onShare?: () => void;
  dimmed?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const reel = sample.source === "reel";
  const caption = reel
    ? null
    : t(sample.caption, { city: t(SAMPLE_CITIES[sample.city].name) });
  // A creator is named only over their own video, never over the city photo it falls back to.
  const credit = !reel
    ? t("aha.shelvrExample")
    : playing
      ? sample.creator
      : null;
  return (
    <View style={styles.reel}>
      {/* The picture is one image to VoiceOver, apart from the Share button, which stays reachable. */}
      <View
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          !reel
            ? `${credit}: ${caption}. ${sample.spots.map((spot) => spot.name).join(", ")}`
            : credit === null
              ? t("aha.sampleBadge")
              : t("aha.reelBy", { handle: credit })
        }
      >
        <Image
          source={reelPicture(sample)}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />
        {sample.source === "reel" ? (
          <ReelVideo reelCode={sample.videoCode} onPlaying={setPlaying} />
        ) : null}
        <View style={styles.scrim} />
      </View>
      {dimmed ? <View style={styles.dim} /> : null}
      <View
        style={styles.badge}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Text style={styles.badgeText}>{t("aha.sampleBadge")}</Text>
      </View>
      <View style={styles.rail}>
        {RAIL.map((name) =>
          name === SHARE && onShare !== undefined ? (
            <View key={name}>
              <View style={styles.railCoach}>
                <Coach
                  label={t("aha.coachTapThis")}
                  style={styles.railCoachPill}
                />
              </View>
              <ScalePressable
                accessibilityRole="button"
                accessibilityLabel={t("common.share")}
                onPress={onShare}
                style={styles.shareRing}
              >
                <AppSymbolIcon name={name} size={24} tintColor="#FFFFFF" />
              </ScalePressable>
            </View>
          ) : (
            <AppSymbolIcon
              key={name}
              name={name}
              size={24}
              tintColor="#FFFFFF"
              style={onShare !== undefined && styles.railFaded}
            />
          ),
        )}
      </View>
      <View
        style={styles.foot}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {credit === null ? null : <Text style={styles.handle}>{credit}</Text>}
        {caption === null ? null : (
          <Text style={styles.caption} numberOfLines={3}>
            {caption}
          </Text>
        )}
      </View>
      {!reel ? (
        <ScrollView
          style={styles.examplePlaces}
          contentContainerStyle={styles.placeRows}
          showsVerticalScrollIndicator={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {sample.spots.map((spot, index) => (
            <View key={spot.name} style={styles.placeRow}>
              <Text style={styles.placeNumber}>{index + 1}</Text>
              <Text style={styles.placeName}>{spot.name}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
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
  scrim: {
    ...StyleSheet.absoluteFillObject,
    experimental_backgroundImage:
      "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0) 60%)",
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  shareRing: {
    width: 48,
    height: 48,
    margin: -12,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  railCoach: {
    position: "absolute",
    right: 44,
    top: -30,
    bottom: -30,
    width: 240,
    justifyContent: "center",
  },
  railCoachPill: {
    alignSelf: "flex-end",
  },
  railFaded: {
    opacity: 0.4,
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
  examplePlaces: {
    position: "absolute",
    left: theme.gap(2),
    right: theme.gap(2),
    bottom: theme.gap(2),
    maxHeight: "45%",
    borderRadius: theme.radius.lg,
    backgroundColor: "rgba(43, 36, 24, 0.8)",
  },
  placeRows: { padding: theme.gap(1.5), gap: theme.gap(1) },
  placeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.gap(1),
  },
  placeNumber: { ...theme.type.subheadStrong, color: theme.colors.primary },
  placeName: { ...theme.type.subheadStrong, color: "#FFFFFF", flex: 1 },
}));
