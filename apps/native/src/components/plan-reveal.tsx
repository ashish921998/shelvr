// PROTOTYPE v2, not for merge: copy is hardcoded English and the share card is
// shown as a preview only (no image export yet).
import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import type { PlanPlace } from "@/lib/make-plan";
import { Image } from "expo-image";
import { useState } from "react";
import { Modal, Pressable, StatusBar, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  ZoomIn,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

type Props = {
  place: PlanPlace | null;
  imageUrl?: string;
  /** Who posted the save, e.g. "@briotchhh". */
  sourceLabel?: string;
  spaceName: string;
  considered: number;
  onOpenMaps: () => void;
  onShare: () => void;
  onPickAgain: () => void;
  onClose: () => void;
};

/** The save's image, out of focus and dimmed, as the whole background. */
function Backdrop({ imageUrl }: { imageUrl?: string }) {
  return (
    <View style={styles.backdrop}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.fill}
          contentFit="cover"
          blurRadius={50}
        />
      ) : null}
      <View style={styles.backdropTint} />
    </View>
  );
}

/** The save as a framed photo, with two blank ones behind it: one of a pile. */
function Photo({ imageUrl, small }: { imageUrl?: string; small?: boolean }) {
  return (
    <View style={[styles.photoWrap, small && styles.photoWrapSmall]}>
      <View style={[styles.photo, styles.photoBehind, styles.tiltLeft]} />
      <View style={[styles.photo, styles.photoBehind, styles.tiltRight]} />
      <View style={styles.photo}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.fill}
            contentFit="cover"
          />
        ) : null}
      </View>
    </View>
  );
}

/** The pick, alone on screen: the save, "Tonight", the name, Maps and Share. */
export function PlanReveal({
  place,
  imageUrl,
  sourceLabel,
  spaceName,
  considered,
  onOpenMaps,
  onShare,
  onPickAgain,
  onClose,
}: Props) {
  const [showCard, setShowCard] = useState(false);
  if (!place) return null;
  const from = `Picked from ${considered} saves in ${spaceName}`;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View style={styles.screen}>
        <Backdrop imageUrl={imageUrl} />
        {showCard ? (
          <View style={styles.content}>
            <ThemedText variant="label" style={styles.soft}>
              This is what gets sent
            </ThemedText>
            <Animated.View entering={ZoomIn.duration(220)} style={styles.card}>
              <Backdrop imageUrl={imageUrl} />
              <View style={styles.cardInner}>
                <Photo imageUrl={imageUrl} small />
                <View style={styles.cardText}>
                  <ThemedText variant="captionStrong" style={styles.eyebrow}>
                    TONIGHT
                  </ThemedText>
                  <ThemedText
                    variant="hero"
                    style={styles.cardName}
                    numberOfLines={2}
                  >
                    {place.name}
                  </ThemedText>
                  {place.area ? (
                    <ThemedText variant="subhead" style={styles.soft}>
                      {place.area}
                    </ThemedText>
                  ) : null}
                </View>
                <View style={styles.cardFooter}>
                  <ThemedText variant="caption" style={styles.soft}>
                    {`Picked from ${considered} saved reels`}
                  </ThemedText>
                  <ThemedText variant="header" style={styles.white}>
                    shelvr
                  </ThemedText>
                </View>
              </View>
            </Animated.View>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={onShare}
                style={styles.primary}
              >
                <ThemedText variant="button" style={styles.primaryText}>
                  Send
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowCard(false)}
                hitSlop={8}
                style={styles.link}
              >
                <ThemedText variant="secondaryLabel" style={styles.soft}>
                  Back
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.content}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to the shortlist"
              onPress={onClose}
              hitSlop={12}
              style={styles.close}
            >
              <AppSymbolIcon name="xmark" size={15} tintColor="#ffffff" />
            </Pressable>
            <Animated.View
              entering={ZoomIn.springify().damping(14).stiffness(140)}
              style={styles.photoSlot}
            >
              <Photo imageUrl={imageUrl} />
            </Animated.View>
            {sourceLabel ? (
              <Animated.View entering={FadeIn.delay(250)}>
                <ThemedText variant="caption" style={styles.soft}>
                  {`from your save · ${sourceLabel}`}
                </ThemedText>
              </Animated.View>
            ) : null}
            <Animated.View
              entering={FadeInDown.delay(180).duration(380)}
              style={styles.text}
            >
              <ThemedText variant="captionStrong" style={styles.eyebrow}>
                TONIGHT
              </ThemedText>
              <ThemedText
                variant="hero"
                style={styles.name}
                numberOfLines={2}
              >
                {place.name}
              </ThemedText>
              {place.area ? (
                <ThemedText variant="bodyLabel" style={styles.soft}>
                  {place.area}
                </ThemedText>
              ) : null}
              <ThemedText variant="subhead" style={styles.why}>
                {place.why}
              </ThemedText>
            </Animated.View>
            <Animated.View
              entering={FadeInDown.delay(320).duration(380)}
              style={styles.actions}
            >
              <ThemedText variant="finePrint" style={styles.fine}>
                {from}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenMaps}
                style={styles.primary}
              >
                <AppSymbolIcon name="map" size={16} tintColor="#2b2418" />
                <ThemedText variant="button" style={styles.primaryText}>
                  Open in Maps
                </ThemedText>
              </Pressable>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowCard(true)}
                  style={styles.secondary}
                >
                  <AppSymbolIcon
                    name="square.and.arrow.up"
                    size={15}
                    tintColor="#ffffff"
                  />
                  <ThemedText variant="subheadStrong" style={styles.white}>
                    Share
                  </ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={onPickAgain}
                  style={styles.secondary}
                >
                  <AppSymbolIcon name="sparkles" size={15} tintColor="#ffffff" />
                  <ThemedText variant="subheadStrong" style={styles.white}>
                    Pick again
                  </ThemedText>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: "#191510",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#191510",
  },
  backdropTint: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(25, 21, 16, 0.62)",
  },
  fill: {
    width: "100%",
    height: "100%",
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingTop: rt.insets.top + theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(2),
    paddingHorizontal: theme.gap(3),
    gap: theme.gap(1.5),
  },
  close: {
    alignSelf: "flex-start",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  photoSlot: {
    marginTop: theme.gap(1),
    marginBottom: theme.gap(1),
  },
  photoWrap: {
    width: 196,
    height: 262,
    alignItems: "center",
    justifyContent: "center",
  },
  photoWrapSmall: {
    width: 150,
    height: 200,
  },
  photo: {
    width: "88%",
    height: "92%",
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#fffdf8",
    backgroundColor: "#3a2f1c",
    transform: [{ rotate: "-2deg" }],
  },
  photoBehind: {
    position: "absolute",
    backgroundColor: "rgba(255, 253, 248, 0.22)",
    borderColor: "rgba(255, 253, 248, 0.35)",
  },
  tiltLeft: {
    transform: [{ rotate: "-10deg" }, { translateX: -14 }],
  },
  tiltRight: {
    transform: [{ rotate: "8deg" }, { translateX: 14 }],
  },
  text: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: theme.gap(0.5),
    marginTop: theme.gap(1),
  },
  eyebrow: {
    color: theme.colors.primary,
    letterSpacing: 3,
  },
  name: {
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 52,
  },
  white: {
    color: "#ffffff",
  },
  soft: {
    color: "rgba(255, 255, 255, 0.78)",
  },
  why: {
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
    marginTop: theme.gap(1),
    paddingHorizontal: theme.gap(1),
  },
  fine: {
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center",
  },
  actions: {
    marginTop: "auto",
    gap: theme.gap(1.5),
    alignSelf: "stretch",
  },
  row: {
    flexDirection: "row",
    gap: theme.gap(1.5),
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1),
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  primaryText: {
    color: "#2b2418",
  },
  secondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1),
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  link: {
    alignSelf: "center",
    paddingVertical: theme.gap(1),
  },
  card: {
    width: "88%",
    aspectRatio: 4 / 5,
    marginTop: theme.gap(3),
    borderRadius: theme.radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  cardInner: {
    flex: 1,
    padding: theme.gap(2.5),
  },
  cardText: {
    marginTop: "auto",
    gap: theme.gap(0.5),
  },
  cardName: {
    color: "#ffffff",
    fontSize: 40,
    lineHeight: 44,
  },
  cardFooter: {
    marginTop: theme.gap(2),
    paddingTop: theme.gap(1.5),
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
}));
