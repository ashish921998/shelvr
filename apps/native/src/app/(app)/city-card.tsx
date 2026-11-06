import { CityStoryCard } from "@/components/city/city-story-card";
import { EmptyState } from "@/components/empty-state";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { cityPins } from "@/lib/city-pins";
import { cityProgress, visitedPinIds } from "@/lib/city-progress";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import { useCityCardShare } from "@/lib/use-city-card-share";
import { usePlaceVisits } from "@/lib/use-place-visit";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { type ComponentRef, useCallback, useMemo, useRef } from "react";
import { Platform, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const CARD_MAX_WIDTH = 340;

export default function CityCardScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  const { city = "" } = useLocalSearchParams<{ city: string }>();
  const items = useQuery(convexQuery(api.items.listCityItems, { city }));
  const visits = usePlaceVisits();
  const pins = useMemo(() => cityPins(items.data ?? []), [items.data]);
  const visited = useMemo(
    () => visitedPinIds(pins, visits.visits),
    [pins, visits.visits],
  );
  const progress = cityProgress(pins, visited);
  const card = useRef<ComponentRef<typeof View>>(null);
  const { sharing, share } = useCityCardShare(card, city, {
    place_count: progress.total,
    visited_count: progress.visited,
  });
  const close = useCallback(() => backOrHome(router), [router]);
  const width = Math.min(CARD_MAX_WIDTH, rt.screen.width - theme.gap(6));

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <Stack.Screen
        options={{
          title: t("cityCard.share"),
          headerTitleStyle: {
            ...theme.type.title,
            color: theme.colors.foreground,
          },
          ...(Platform.OS === "android"
            ? {
                headerLeft: () => (
                  <HeaderIconButton
                    icon="xmark"
                    label={t("common.close")}
                    onPress={close}
                  />
                ),
              }
            : {}),
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="xmark"
            tintColor={theme.colors.foreground}
            onPress={close}
          >
            {t("common.close")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
      {items.isError || visits.isError ? (
        <EmptyState
          title={t("errors.unexpectedTitle")}
          message={t("errors.retrySoon")}
        />
      ) : items.data === undefined || !visits.loaded ? (
        <ScreenLoader />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
        >
          <CityStoryCard
            ref={card}
            city={city}
            pins={pins}
            visited={visited}
            width={width}
          />
          <View style={{ width }}>
            <Button
              title={t("common.share")}
              loading={sharing}
              disabled={pins.length === 0}
              onPress={() => void share()}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    alignItems: "center",
    gap: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(3),
  },
}));
