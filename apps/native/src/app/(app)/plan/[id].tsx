import { EmptyState } from "@/components/empty-state";
import { PlanDeck } from "@/components/plan-deck";
import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { runIntent } from "@/lib/intents";
import {
  daysLeft,
  placeLabel,
  planShareText,
  useMakePlan,
  usePlaceVisits,
  usePlanAsk,
  usePlanDeck,
  usePlanPicker,
  votesFor,
  type PlanPlace,
} from "@/lib/make-plan";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, Share, View } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const tick = () => haptic("tick");

function haptic(kind: "tick" | "done") {
  if (process.env.EXPO_OS !== "ios") return;
  if (kind === "tick") {
    void Haptics.selectionAsync();
  } else {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

/** The space's saves fanned out and shuffling while the model reads them. */
function PlanLoading({ images }: { images: string[] }) {
  useAppLocale();
  const reducedMotion = useReducedMotion();
  const swing = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    swing.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 520 }),
        withTiming(-1, { duration: 520 }),
      ),
      -1,
      true,
    );
  }, [reducedMotion, swing]);
  const left = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-12 + swing.value * 6}deg` }],
  }));
  const middle = useAnimatedStyle(() => ({
    transform: [{ translateY: swing.value * -6 }],
  }));
  const right = useAnimatedStyle(() => ({
    transform: [{ rotate: `${12 - swing.value * 6}deg` }],
  }));
  const fan = [left, middle, right];
  return (
    <View style={styles.loading}>
      <View style={styles.fan}>
        {images.slice(0, 3).map((uri, i) => (
          <Animated.View
            key={uri}
            style={[styles.fanCard, styles.fanCardAt(i), fan[i]]}
          >
            <Image source={{ uri }} style={styles.fill} contentFit="cover" />
          </Animated.View>
        ))}
      </View>
      <ThemedText variant="subheadLabel" style={styles.muted}>
        {t("plan.reading")}
      </ThemedText>
    </View>
  );
}

/** Maps and "We went" for the card on top, once the deck has dealt one. */
function TonightActions({
  place,
  visited,
  onOpenMaps,
  onToggleVisited,
}: {
  place: PlanPlace;
  visited: boolean;
  onOpenMaps: () => void;
  onToggleVisited: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Animated.View entering={FadeIn} style={styles.actions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("plan.openMapsFor", { name: place.name })}
        onPress={onOpenMaps}
        style={({ pressed }) => [
          styles.action,
          styles.actionFilled,
          pressed && styles.pressed,
        ]}
      >
        <AppSymbolIcon name="map" size={16} tintColor={theme.colors.onTint} />
        <ThemedText variant="button" style={styles.onTint}>
          {t("plan.openMaps")}
        </ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${place.name}, ${visited ? t("plan.been") : t("plan.weWent")}`}
        accessibilityState={{ selected: visited }}
        onPress={onToggleVisited}
        style={({ pressed }) => [
          styles.action,
          visited ? styles.actionWent : styles.actionOpen,
          pressed && styles.pressed,
        ]}
      >
        <AppSymbolIcon
          name="checkmark"
          size={15}
          tintColor={visited ? theme.colors.danger : theme.colors.foreground}
        />
        <ThemedText variant="button" style={visited ? styles.went : undefined}>
          {visited ? t("plan.been") : t("plan.weWent")}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

/** "Ask someone": the vote link, as an outlined capsule beside the deal. */
function AskButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        styles.actionOpen,
        busy && styles.actionBusy,
        pressed && styles.pressed,
      ]}
    >
      <AppSymbolIcon
        name="square.and.arrow.up"
        size={15}
        tintColor={theme.colors.foreground}
      />
      <ThemedText variant="button">{t("plan.ask")}</ThemedText>
    </Pressable>
  );
}

/**
 * The line under the deck: how to use it, the link's votes while one is
 * open, or where a just-marked "We went" place goes next time.
 */
function deckHint(
  been: PlanPlace | null,
  votes: { voters: number; expiresAt: number } | null | undefined,
): string {
  if (been) return t("plan.beenHint", { name: been.name });
  if (votes && votes.voters > 0) {
    const voters = t("plan.voterCount", { count: votes.voters });
    const days = t("plan.daysLeft", { count: daysLeft(votes.expiresAt) });
    return `${voters} ${days}`;
  }
  return t("plan.deckHint");
}

/**
 * Pinned under the list so the pick and its result stay on screen however
 * long the shortlist is: Deal me tonight and Ask someone, then once dealt
 * the card's actions, Ask someone and Deal again.
 */
function PlanFooter({
  dealt,
  place,
  visited,
  spinning,
  askButton,
  onOpenMaps,
  onToggleVisited,
  onDeal,
}: {
  dealt: boolean;
  /** The card on top once dealt. */
  place: PlanPlace | null;
  visited: boolean;
  spinning: boolean;
  askButton: ReactNode;
  onOpenMaps: () => void;
  onToggleVisited: () => void;
  onDeal: () => void;
}) {
  return (
    <View style={styles.footer}>
      {place ? (
        <TonightActions
          place={place}
          visited={visited}
          onOpenMaps={onOpenMaps}
          onToggleVisited={onToggleVisited}
        />
      ) : null}
      {dealt ? (
        <>
          {askButton}
          <Pressable
            accessibilityRole="button"
            onPress={onDeal}
            hitSlop={8}
            style={({ pressed }) => [styles.again, pressed && styles.pressed]}
          >
            <ThemedText variant="secondaryLabel" style={styles.muted}>
              {t("plan.dealAgain")}
            </ThemedText>
          </Pressable>
        </>
      ) : (
        <View style={styles.actions}>
          <Button
            title={t("plan.pick")}
            onPress={onDeal}
            disabled={spinning}
            style={styles.deal}
          />
          {askButton}
        </View>
      )}
    </View>
  );
}

export default function PlanScreen() {
  const locale = useAppLocale();
  const { id, city } = useLocalSearchParams<{ id: string; city?: string }>();
  const spaceId = id as Id<"spaces">;
  const router = useRouter();
  const { theme } = useUnistyles();
  const { data: space } = useQuery(
    convexQuery(api.spaces.getSpace, { id: spaceId }),
  );
  const { data: votes } = useQuery(
    convexQuery(api.planShares.latestPlanShare, { spaceId }),
  );
  const inCity = city || undefined;
  const { state, retry } = useMakePlan(spaceId, locale, inCity);
  const reducedMotion = useReducedMotion();
  const places: PlanPlace[] = state.status === "ready" ? state.places : [];
  const { ask, asking } = usePlanAsk(spaceId, inCity, places);
  const planId = state.status === "ready" ? state.planId : null;
  const deck = usePlanDeck(planId, places.length);
  const { show } = deck;
  const onPicked = useCallback(
    (index: number) => {
      show(index);
      haptic("done");
      analytics.capture("plan_picked", { place_count: places.length });
    },
    [places.length, show],
  );
  const { highlight, pickedPlace, isSpinning, pickForMe } = usePlanPicker(
    places,
    planId,
    {
      reducedMotion,
      onStep: tick,
      onPicked,
    },
  );
  const { isVisited, toggle: toggleVisited } = usePlaceVisits();
  // While dealing, the deck shuffles through its cards; then the card on top
  // is the one the actions below act on.
  const front = isSpinning && highlight !== null ? highlight : deck.front;
  const frontPlace = places[front] ?? null;
  const hasPlaces = state.status === "ready" && places.length > 0;
  const dealt = pickedPlace !== null && !isSpinning;
  const frontBeen = dealt && frontPlace !== null && isVisited(frontPlace);

  const { imageById, titleById } = useMemo(() => {
    const images = new Map<string, string>();
    const titles = new Map<string, string>();
    for (const item of space?.items ?? []) {
      const uri = item.imageUrl ?? item.heroImageUrl;
      if (uri) images.set(item._id, uri);
      if (item.title) titles.set(item._id, item.title);
    }
    return { imageById: images, titleById: titles };
  }, [space]);

  // A new plan replaces the old one, its pick and any spin still running.
  const again = () => void retry();

  const share = async () => {
    if (!space || places.length === 0) return;
    try {
      const result = await Share.share({
        message: planShareText(space.name, places, pickedPlace),
      });
      if (result.action === Share.sharedAction) {
        analytics.capture("plan_shared", {
          place_count: places.length,
          picked: pickedPlace !== null,
        });
      }
    } catch (error) {
      analytics.captureError("plan_share_failed", error);
    }
  };

  const openMaps = (place: PlanPlace, rank: number) => {
    analytics.capture("plan_place_opened", { rank });
    runIntent("open_maps", placeLabel(place)).catch((error: unknown) =>
      analytics.captureError("plan_open_maps_failed", error),
    );
  };

  const canShare = places.length > 0;

  return (
    <>
      <Stack.Screen
        options={
          Platform.OS === "android"
            ? {
                title: "",
                headerTransparent: false,
                headerStyle: { backgroundColor: theme.colors.background },
                headerRight: canShare
                  ? () => (
                      <HeaderIconButton
                        icon="square.and.arrow.up"
                        label={t("common.share")}
                        onPress={share}
                      />
                    )
                  : undefined,
              }
            : undefined
        }
      />
      {Platform.OS === "ios" && canShare ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="square.and.arrow.up"
            tintColor={theme.colors.foreground}
            onPress={share}
          >
            {t("common.share")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <View style={styles.headingRow}>
          <View style={styles.heading}>
            {space ? (
              <ThemedText variant="label" style={styles.muted}>
                {space.name}
              </ThemedText>
            ) : null}
            <ThemedText variant="largeTitle">{t("plan.title")}</ThemedText>
            {city && hasPlaces ? (
              <ThemedText variant="secondaryLabel" style={styles.muted}>
                {t("plan.inCity", { city, count: places.length })}
              </ThemedText>
            ) : null}
          </View>
          {hasPlaces ? (
            <Pressable
              accessibilityRole="button"
              onPress={again}
              hitSlop={8}
              style={({ pressed }) => [
                styles.shuffle,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText variant="secondaryLabel" style={styles.muted}>
                {t("plan.again")}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        {state.status === "loading" ? (
          <PlanLoading images={[...imageById.values()]} />
        ) : null}

        {hasPlaces ? (
          <>
            <PlanDeck
              places={places}
              front={front}
              flipped={deck.flipped && !isSpinning}
              imageFor={(place) => imageById.get(place.itemId)}
              titleFor={(place) => titleById.get(place.itemId)}
              isVisited={isVisited}
              tallyFor={(place) => votesFor(votes, place)}
              onFlip={deck.flip}
              onNext={deck.next}
              onOpenMaps={openMaps}
            />
            <ThemedText
              variant="caption"
              style={[styles.muted, styles.hint]}
              accessibilityLiveRegion="polite"
            >
              {deckHint(frontBeen ? frontPlace : null, votes)}
            </ThemedText>
          </>
        ) : null}

        {state.status === "ready" && places.length === 0 ? (
          <View style={styles.message}>
            <EmptyState
              title={t("plan.emptyTitle")}
              message={
                state.considered === 0
                  ? t("plan.emptySpaceBody")
                  : t("plan.emptyBody")
              }
            />
          </View>
        ) : null}

        {state.status === "ai_off" ? (
          <View style={styles.message}>
            <EmptyState title={t("plan.make")} message={t("plan.aiOff")} />
            <Button
              title={t("profile.settings")}
              onPress={() => router.push("/settings")}
            />
            {/* Back from Settings with AI on, the screen is still mounted. */}
            <Pressable
              accessibilityRole="button"
              onPress={again}
              hitSlop={8}
              style={({ pressed }) => [styles.again, pressed && styles.pressed]}
            >
              <ThemedText variant="secondaryLabel" style={styles.muted}>
                {t("common.tryAgain")}
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        {state.status === "error" ? (
          <View style={styles.message}>
            <EmptyState
              title={t("plan.failedTitle")}
              message={t("errors.retrySoon")}
            />
            <Button title={t("common.tryAgain")} onPress={again} />
          </View>
        ) : null}
      </ScrollView>
      {hasPlaces ? (
        // Pinned under the list so the pick and its result stay on screen
        // however long the shortlist is.
        <PlanFooter
          dealt={dealt}
          place={dealt ? frontPlace : null}
          visited={frontBeen}
          spinning={isSpinning}
          askButton={<AskButton busy={asking} onPress={() => void ask()} />}
          onOpenMaps={() => frontPlace && openMaps(frontPlace, front + 1)}
          onToggleVisited={() => frontPlace && toggleVisited(frontPlace)}
          onDeal={pickForMe}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(4),
    gap: theme.gap(2),
  },
  footer: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(1.5),
    backgroundColor: theme.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: theme.gap(1),
  },
  // Sits on the title's last line, not centred against the whole heading.
  shuffle: {
    paddingBottom: theme.gap(0.75),
  },
  heading: {
    flexShrink: 1,
    gap: theme.gap(0.5),
    marginTop: theme.gap(1),
  },
  muted: {
    color: theme.colors.muted,
  },
  loading: {
    alignItems: "center",
    gap: theme.gap(3),
    paddingVertical: theme.gap(6),
  },
  fan: {
    width: theme.gap(24),
    height: theme.gap(18),
    alignItems: "center",
    justifyContent: "center",
  },
  fanCard: {
    position: "absolute",
    width: theme.gap(11),
    height: theme.gap(15),
    borderRadius: theme.radius.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.surfaceMuted,
  },
  fanCardAt: (index: number) => ({
    left: theme.gap(1) + index * theme.gap(5.5),
    zIndex: index === 1 ? 2 : 1,
  }),
  fill: {
    width: "100%",
    height: "100%",
  },
  actions: {
    flexDirection: "row",
    gap: theme.gap(1),
  },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1),
    minHeight: theme.control.minHeight + theme.gap(0.5),
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "transparent",
  },
  actionFilled: {
    backgroundColor: theme.colors.primary,
  },
  actionOpen: {
    borderColor: theme.colors.foreground,
  },
  actionWent: {
    borderColor: theme.colors.danger,
  },
  actionBusy: {
    opacity: theme.opacity.disabled,
  },
  // Deal me tonight keeps its capsule, but shares the row with Ask someone.
  deal: {
    flex: 1,
  },
  onTint: {
    color: theme.colors.onTint,
  },
  went: {
    color: theme.colors.danger,
  },
  hint: {
    textAlign: "center",
    // Two lines held, so the We went hint replacing it moves nothing.
    minHeight: 36,
    paddingHorizontal: theme.gap(2),
  },
  again: {
    alignSelf: "center",
    paddingVertical: theme.gap(1),
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
  message: {
    gap: theme.gap(2),
    paddingVertical: theme.gap(6),
  },
}));
