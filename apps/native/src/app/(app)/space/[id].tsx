import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import {
  HeaderActionMenu,
  HeaderIconButton,
} from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import type { FeedItem } from "@/components/item-card";
import { MasonryFeed } from "@/components/masonry-feed";
import { PlanPickerSheet } from "@/components/plan-picker-sheet";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AppSymbolIcon } from "@/components/symbol";
import { HeaderScrim } from "@/components/ui/header-scrim";
import { useMemo, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { analytics } from "@/lib/analytics";
import { usePaywallGuard } from "@/lib/entitlement";
import { canMakePlan } from "@/lib/make-plan";
import { canPlanTrip } from "@/lib/trip";

export default function SpaceScreen() {
  useAppLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { data: space } = useQuery(
    convexQuery(api.spaces.getSpace, { id: id as Id<"spaces"> }),
  );
  // A trip already made gets its own row under the title, one tap away.
  const { data: storedTrip } = useQuery(
    convexQuery(api.tripData.getSpaceTrip, { spaceId: id as Id<"spaces"> }),
  );
  const [picking, setPicking] = useState(false);
  const deleteSpace = useMutation(api.spaces.deleteSpace);
  const acceptAllSuggestions = useMutation(api.spaces.acceptAllSuggestions);
  const { guard: planGuard } = usePaywallGuard("make_plan");
  const { guard: tripGuard } = usePaywallGuard("plan_trip");

  // Suggestions lead the feed (they're the ones asking for a decision),
  // wearing the sparkle badge; saved items follow. Item detail rebuilds this
  // exact ordering for swipe-paging, so keep the two in sync.
  const feedItems = useMemo<FeedItem[]>(() => {
    if (!space) return [];
    return [
      ...space.suggestions.map((item) => ({ ...item, suggested: true })),
      ...space.items,
    ];
  }, [space]);

  // `undefined` = loading (nothing cached yet); `null` = not found.
  if (space === undefined) {
    return <ScreenLoader label={t("loading.space")} />;
  }

  if (space === null) {
    return (
      <View style={styles.loading}>
        <EmptyState title={t("item.goneTitle")} message={t("spaces.gone")} />
      </View>
    );
  }

  const confirmDelete = () => {
    Alert.alert(t("spaces.deleteTitle"), t("spaces.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          router.back();
          await deleteSpace({ id: space._id });
          analytics.capture("space_deleted");
        },
      },
    ]);
  };

  const addAll = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    acceptAllSuggestions({ spaceId: space._id })
      .then((count) => {
        if (count > 0) {
          analytics.capture("space_suggestions_accepted", {
            suggestion_count: count,
          });
        }
      })
      .catch(() => undefined);
  };

  const suggestionCount = space.suggestions.length;
  const canPlan = canMakePlan(space.items);

  const makePlan = () => {
    void planGuard(() =>
      router.push({ pathname: "/plan/[id]", params: { id: space._id } }),
    );
  };

  const canTrip = canPlanTrip(space.items) || Boolean(storedTrip);
  const planTrip = () => {
    void tripGuard(() =>
      router.push({ pathname: "/trip/[id]", params: { id: space._id } }),
    );
  };

  // One Plan button. It asks only when both kinds of plan can be made.
  const openPlan = () => {
    if (canPlan && canTrip) setPicking(true);
    else if (canPlan) makePlan();
    else planTrip();
  };

  const planPill =
    canPlan || canTrip ? (
      <Pressable
        accessibilityRole="button"
        onPress={openPlan}
        hitSlop={8}
        style={({ pressed }) => [styles.planPill, pressed && { opacity: 0.7 }]}
      >
        <AppSymbolIcon name="map" size={14} tintColor={theme.colors.onTint} />
        <Text style={styles.planText}>{t("plan.button")}</Text>
      </Pressable>
    ) : null;

  const tripRow = storedTrip ? (
    <Pressable
      accessibilityRole="button"
      onPress={planTrip}
      hitSlop={8}
      style={({ pressed }) => [styles.tripRow, pressed && { opacity: 0.7 }]}
    >
      <AppSymbolIcon
        name="airplane"
        size={13}
        tintColor={theme.colors.primaryText}
      />
      <Text style={styles.tripText}>
        {storedTrip.city
          ? t("trip.yourTrip", { city: storedTrip.city })
          : t("trip.yourTripNoCity")}
        {" · "}
        {t("trip.dayCount", { count: storedTrip.days.length })}
      </Text>
      <AppSymbolIcon
        name="chevron.right"
        size={11}
        tintColor={theme.colors.primaryText}
      />
    </Pressable>
  ) : null;

  return (
    <>
      <Stack.Screen
        options={
          Platform.OS === "android"
            ? {
                title: space.name,
                headerTransparent: false,
                headerStyle: { backgroundColor: theme.colors.background },
                headerTitleAlign: "center",
                headerTitleStyle: {
                  fontFamily: theme.fonts.display,
                  color: theme.colors.foreground,
                },
                headerRight: () => (
                  <View style={styles.headerActions}>
                    <HeaderIconButton
                      icon="plus"
                      label={t("spaces.addItem")}
                      onPress={() =>
                        router.push({
                          pathname: "/add",
                          params: { spaceId: id },
                        })
                      }
                    />
                    <HeaderActionMenu
                      icon="ellipsis"
                      label={t("spaces.actions")}
                      title={space.name}
                      actions={[
                        {
                          label: t("spaces.editTitle"),
                          onPress: () =>
                            router.push({
                              pathname: "/new-space",
                              params: { id },
                            }),
                        },
                        {
                          label: t("spaces.delete"),
                          destructive: true,
                          onPress: confirmDelete,
                        },
                      ]}
                    />
                  </View>
                ),
              }
            : undefined
        }
      />
      {Platform.OS === "ios" ? (
        <Stack.Title
          style={{
            fontFamily: theme.fonts.display,
            color: theme.colors.foreground,
          }}
        >
          {space.name}
        </Stack.Title>
      ) : null}
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="plus"
            tintColor={theme.colors.foreground}
            onPress={() =>
              router.push({ pathname: "/add", params: { spaceId: id } })
            }
          >
            {t("common.add")}
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Menu icon="ellipsis">
            <Stack.Toolbar.MenuAction
              icon="pencil"
              onPress={() =>
                router.push({ pathname: "/new-space", params: { id } })
              }
            >
              {t("spaces.editTitle")}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="trash"
              destructive
              onPress={confirmDelete}
            >
              {t("spaces.delete")}
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
      <View
        testID={
          space.fixtureKey
            ? `fixture-space-detail-${space.fixtureKey}`
            : undefined
        }
        style={styles.container}
      >
        <MasonryFeed
          items={feedItems}
          source={{ from: "space", spaceId: id }}
          firstItemZoomTarget
          ListHeaderComponent={
            suggestionCount > 0 || planPill || tripRow ? (
              <View style={styles.headerPills}>
                {tripRow}
                {planPill}
                {suggestionCount > 0 ? (
                  <Animated.View
                    entering={FadeIn.duration(250)}
                    exiting={FadeOut.duration(200)}
                    style={styles.suggestionsPill}
                  >
                    <AppSymbolIcon
                      name="sparkles"
                      size={14}
                      tintColor={theme.colors.primaryText}
                    />
                    <Text style={styles.suggestionsText}>
                      {t("spaces.suggestionCount", { count: suggestionCount })}
                    </Text>
                    <Pressable
                      onPress={addAll}
                      hitSlop={8}
                      style={({ pressed }) => pressed && { opacity: 0.7 }}
                    >
                      <Text style={styles.addAllText}>
                        {t("spaces.addAll")}
                      </Text>
                    </Pressable>
                  </Animated.View>
                ) : null}
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              title={t("spaces.emptyTitle")}
              message={t("spaces.emptyBody")}
            />
          }
        />
        <HeaderScrim />
      </View>
      <PlanPickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        onGoOut={() => {
          setPicking(false);
          makePlan();
        }}
        onTrip={() => {
          setPicking(false);
          planTrip();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: theme.gap(1),
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  // One row under the title; wraps only when the text is too wide.
  headerPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.gap(2),
    gap: theme.gap(1),
    marginTop: theme.gap(0.5),
    marginBottom: theme.gap(1),
  },
  planPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    backgroundColor: theme.colors.primary,
    borderRadius: 50,
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(2),
  },
  planText: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.onTint,
  },
  tripRow: {
    flexBasis: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(0.75),
  },
  tripText: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  suggestionsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 50,
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(2),
  },
  suggestionsText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  addAllText: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
    textDecorationLine: "underline",
  },
}));
