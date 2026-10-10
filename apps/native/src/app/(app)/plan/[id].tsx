import { EmptyState } from "@/components/empty-state";
import { PlanPlaceCard } from "@/components/plan-place-card";
import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { runIntent } from "@/lib/intents";
import {
  placeLabel,
  planShareText,
  useMakePlan,
  usePlanPicker,
  type PlanPlace,
} from "@/lib/make-plan";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
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

export default function PlanScreen() {
  const locale = useAppLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const spaceId = id as Id<"spaces">;
  const router = useRouter();
  const { theme } = useUnistyles();
  const { data: space } = useQuery(
    convexQuery(api.spaces.getSpace, { id: spaceId }),
  );
  const { state, retry } = useMakePlan(spaceId, locale);
  const reducedMotion = useReducedMotion();
  const places: PlanPlace[] = state.status === "ready" ? state.places : [];
  const planId = state.status === "ready" ? state.planId : null;
  const onPicked = useCallback(() => {
    haptic("done");
    analytics.capture("plan_picked", { place_count: places.length });
  }, [places.length]);
  const { highlight, picked, pickedPlace, isSpinning, pickForMe } =
    usePlanPicker(places, planId, {
      reducedMotion,
      onStep: tick,
      onPicked,
    });

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
        <View style={styles.heading}>
          {space ? (
            <ThemedText variant="label" style={styles.muted}>
              {space.name}
            </ThemedText>
          ) : null}
          <ThemedText variant="largeTitle">{t("plan.title")}</ThemedText>
        </View>

        {state.status === "loading" ? (
          <PlanLoading images={[...imageById.values()]} />
        ) : null}

        {state.status === "ready" && places.length > 0 ? (
          <>
            <View style={styles.list}>
              {places.map((place, i) => (
                <PlanPlaceCard
                  key={`${place.itemId}-${place.name}`}
                  place={place}
                  rank={i + 1}
                  sourceImageUrl={imageById.get(place.itemId)}
                  sourceTitle={titleById.get(place.itemId)}
                  highlighted={(picked ?? highlight) === i}
                  onOpenMaps={() => openMaps(place, i + 1)}
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={again}
              hitSlop={8}
              style={({ pressed }) => [styles.again, pressed && styles.pressed]}
            >
              <ThemedText variant="secondaryLabel" style={styles.muted}>
                {t("plan.again")}
              </ThemedText>
            </Pressable>
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
      {state.status === "ready" && places.length > 0 ? (
        // Pinned under the list so the pick and its result stay on screen
        // however long the shortlist is.
        <View style={styles.footer}>
          {pickedPlace ? (
            <Animated.View
              entering={FadeIn}
              style={styles.tonight}
              accessibilityLiveRegion="polite"
              accessibilityRole="text"
            >
              <AppSymbolIcon
                name="sparkles"
                size={16}
                tintColor={theme.colors.onTint}
              />
              <ThemedText variant="headline" style={styles.tonightText}>
                {t("plan.tonight", { name: pickedPlace.name })}
              </ThemedText>
            </Animated.View>
          ) : null}
          <Button
            title={t("plan.pick")}
            onPress={pickForMe}
            disabled={isSpinning}
          />
        </View>
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
  heading: {
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
  tonight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
  },
  tonightText: {
    flex: 1,
    color: theme.colors.onTint,
  },
  list: {
    gap: theme.gap(1.5),
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
