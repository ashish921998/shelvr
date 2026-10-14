import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { deckOrder, type PlanPlace } from "@/lib/make-plan";
import { motion } from "@/lib/motion";
import { Image } from "expo-image";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";

type Props = {
  places: PlanPlace[];
  /** The card on top. */
  front: number;
  /** The top card shows its back: why it was picked and where from. */
  flipped: boolean;
  imageFor: (place: PlanPlace) => string | undefined;
  titleFor: (place: PlanPlace) => string | undefined;
  isVisited: (place: PlanPlace) => boolean;
  onFlip: () => void;
  /** The top card was swiped away; it goes to the back of the deck. */
  onNext: () => void;
  onOpenMaps: (place: PlanPlace, rank: number) => void;
};

// Each card under the top one sits a little turned, so the deck reads as a
// hand of photos rather than a list. Index 0 is the top card.
const FAN = [
  { rotate: -1, x: 0, y: 0 },
  { rotate: 5, x: 14, y: 8 },
  { rotate: -6, x: -16, y: 14 },
  { rotate: 9, x: 22, y: 22 },
];
const FLIP_MS = 360;

/** A plan as a deck of photo cards: swipe for the next, tap to flip. */
export function PlanDeck({
  places,
  front,
  flipped,
  imageFor,
  titleFor,
  isVisited,
  onFlip,
  onNext,
  onOpenMaps,
}: Props) {
  useAppLocale();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const cardWidth = Math.min(width - 96, 300);
  const cardHeight = Math.round(cardWidth * 1.38);
  const order = deckOrder(places.length, front);

  const panX = useSharedValue(0);
  const turn = useSharedValue(flipped ? 1 : 0);

  // A new top card arrives centered, face up.
  useLayoutEffect(() => {
    panX.set(0);
  }, [front, panX]);
  useEffect(() => {
    const target = flipped ? 1 : 0;
    turn.set(
      reducedMotion ? target : withTiming(target, { duration: FLIP_MS }),
    );
  }, [flipped, reducedMotion, turn]);

  const swipe = useMemo(() => {
    const away = width * 1.2;
    return Gesture.Pan()
      .activeOffsetX([-12, 12])
      .failOffsetY([-14, 14])
      .onChange((event) => {
        panX.set(event.translationX);
      })
      .onEnd((event, success) => {
        const x = event.translationX;
        const commit =
          success &&
          (Math.abs(x) > cardWidth / 3 || Math.abs(event.velocityX) > 800);
        if (!commit) {
          panX.set(withSpring(0, motion.spring.drag));
          return;
        }
        const direction = x + event.velocityX * 0.1 < 0 ? -1 : 1;
        panX.set(
          withTiming(direction * away, { duration: 220 }, (done) => {
            if (done) scheduleOnRN(onNext);
          }),
        );
      });
  }, [width, cardWidth, panX, onNext]);

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: panX.get() },
      {
        rotate: `${interpolate(panX.get(), [-cardWidth, 0, cardWidth], [-12, FAN[0].rotate, 12])}deg`,
      },
    ],
  }));
  const faceStyle = useAnimatedStyle(() => ({
    opacity: turn.get() < 0.5 ? 1 : 0,
    transform: [{ perspective: 1200 }, { rotateY: `${turn.get() * 180}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: turn.get() < 0.5 ? 0 : 1,
    transform: [
      { perspective: 1200 },
      { rotateY: `${turn.get() * 180 + 180}deg` },
    ],
  }));

  const size = { width: cardWidth, height: cardHeight };

  return (
    <View style={[styles.deck, { height: cardHeight + 40 }]}>
      {order.map((index, i) => {
        const place = places[index];
        if (!place) return null;
        const depth = order.length - 1 - i;
        const key = `${place.itemId}-${place.name}`;
        if (depth > 0) {
          const fan = FAN[depth] ?? FAN[FAN.length - 1];
          return (
            <View
              key={key}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.card,
                size,
                {
                  transform: [
                    { translateX: fan.x },
                    { translateY: fan.y },
                    { rotate: `${fan.rotate}deg` },
                  ],
                },
              ]}
            >
              <CardFace
                place={place}
                imageUrl={imageFor(place)}
                visited={isVisited(place)}
              />
            </View>
          );
        }
        const rank = index + 1;
        return (
          <GestureDetector key={key} gesture={swipe}>
            <Animated.View style={[styles.top, size, topStyle]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={flipped ? place.why : cardLabel(place)}
                accessibilityHint={t("plan.flipHint")}
                accessibilityActions={[
                  { name: "activate" },
                  { name: "next", label: t("plan.nextCard") },
                  {
                    name: "maps",
                    label: t("plan.openMapsFor", { name: place.name }),
                  },
                ]}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (nativeEvent.actionName === "next") onNext();
                  else if (nativeEvent.actionName === "maps")
                    onOpenMaps(place, rank);
                  else onFlip();
                }}
                onPress={onFlip}
                style={styles.fill}
              >
                <Animated.View
                  style={[styles.card, styles.face, faceStyle]}
                  pointerEvents={flipped ? "none" : "auto"}
                >
                  <CardFace
                    place={place}
                    imageUrl={imageFor(place)}
                    visited={isVisited(place)}
                  />
                </Animated.View>
                <Animated.View
                  style={[styles.card, styles.face, styles.back, backStyle]}
                  pointerEvents={flipped ? "auto" : "none"}
                >
                  <CardBack
                    place={place}
                    imageUrl={imageFor(place)}
                    sourceTitle={titleFor(place)}
                    onOpenMaps={() => onOpenMaps(place, rank)}
                  />
                </Animated.View>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        );
      })}
    </View>
  );
}

function cardLabel(place: PlanPlace): string {
  return place.area ? `${place.name}, ${place.area}` : place.name;
}

/** The photo side: the save's image, the place's name, and a stamp once been. */
function CardFace({
  place,
  imageUrl,
  visited,
}: {
  place: PlanPlace;
  imageUrl?: string;
  visited: boolean;
}) {
  return (
    <>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.fill}
          contentFit="cover"
          accessible={false}
        />
      ) : (
        <View style={[styles.fill, styles.noImage]} />
      )}
      <View style={styles.caption}>
        <ThemedText
          variant="largeTitle"
          style={styles.onPhoto}
          numberOfLines={2}
        >
          {place.name}
        </ThemedText>
        {place.area ? (
          <ThemedText
            variant="caption"
            style={styles.onPhotoSoft}
            numberOfLines={1}
          >
            {place.area}
          </ThemedText>
        ) : null}
      </View>
      {visited ? <Stamp /> : null}
    </>
  );
}

/** "We went", inked on the photo. */
function Stamp() {
  return (
    <View style={styles.stamp}>
      <View style={styles.stampRing} />
      <ThemedText variant="title" style={styles.stampText}>
        {t("plan.weWent")}
      </ThemedText>
    </View>
  );
}

/** The back: why this place, the save it came from, and Maps. */
function CardBack({
  place,
  imageUrl,
  sourceTitle,
  onOpenMaps,
}: {
  place: PlanPlace;
  imageUrl?: string;
  sourceTitle?: string;
  onOpenMaps: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.backBody}>
      <ThemedText variant="label" style={styles.muted}>
        {t("plan.why")}
      </ThemedText>
      <ThemedText variant="title" numberOfLines={6}>
        {place.why}
      </ThemedText>
      {sourceTitle || imageUrl ? (
        <View style={styles.source}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.sourceThumb}
              contentFit="cover"
              accessible={false}
            />
          ) : null}
          {sourceTitle ? (
            <ThemedText
              variant="caption"
              style={styles.sourceText}
              numberOfLines={2}
            >
              {t("plan.from", { title: sourceTitle })}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("plan.openMapsFor", { name: place.name })}
        onPress={onOpenMaps}
        hitSlop={8}
        style={({ pressed }) => [styles.maps, pressed && styles.pressed]}
      >
        <AppSymbolIcon
          name="map"
          size={14}
          tintColor={theme.colors.primaryText}
        />
        <ThemedText variant="labelStrong" style={styles.mapsText}>
          {t("plan.openMaps")}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  deck: {
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    position: "absolute",
    borderRadius: theme.radius.xl,
    borderWidth: 5,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: "hidden",
    boxShadow: "0 14px 32px rgba(43, 36, 24, 0.24)",
  },
  top: {
    position: "absolute",
  },
  face: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: "hidden",
  },
  back: {
    backgroundColor: theme.colors.surface,
  },
  fill: {
    width: "100%",
    height: "100%",
  },
  noImage: {
    backgroundColor: theme.colors.primarySoft,
  },
  caption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.gap(0.25),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(1.5),
    paddingBottom: theme.gap(2),
    backgroundColor: theme.colors.overlay,
  },
  onPhoto: {
    color: theme.colors.onOverlay,
  },
  onPhotoSoft: {
    color: theme.colors.onOverlay,
    opacity: 0.85,
  },
  stamp: {
    position: "absolute",
    top: theme.gap(2.5),
    right: theme.gap(2),
    width: theme.gap(15),
    height: theme.gap(15),
    borderRadius: theme.gap(7.5),
    borderWidth: 4,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-14deg" }],
    opacity: 0.92,
  },
  stampRing: {
    position: "absolute",
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderRadius: theme.gap(7.5),
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.danger,
  },
  stampText: {
    color: theme.colors.danger,
    textAlign: "center",
  },
  backBody: {
    flex: 1,
    padding: theme.gap(2),
    gap: theme.gap(1.5),
  },
  muted: {
    color: theme.colors.muted,
  },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    padding: theme.gap(1),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  sourceThumb: {
    width: theme.gap(5),
    height: theme.gap(6.5),
    borderRadius: theme.radius.sm,
  },
  sourceText: {
    flex: 1,
    color: theme.colors.muted,
  },
  maps: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: theme.gap(0.75),
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 999,
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.75),
  },
  mapsText: {
    color: theme.colors.primaryText,
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
}));
