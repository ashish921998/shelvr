import { CityCover } from "@/components/city/city-cover";
import { SaveRow } from "@/components/city/save-row";
import { EmptyState } from "@/components/empty-state";
import { HeaderScrim } from "@/components/ui/header-scrim";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { type CityPlanKind, useCityPlan } from "@/lib/city-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

const COVER_HEIGHT = 220;

function PlanButton({
  kind,
  busy,
  onPress,
}: {
  kind: CityPlanKind;
  busy: CityPlanKind | null;
  onPress: () => void;
}) {
  const label = t(
    kind === "date" ? "homePlaces.planDate" : "homePlaces.planTrip",
  );
  const hint = t(
    kind === "date" ? "homePlaces.planDateHint" : "homePlaces.planTripHint",
  );
  const dark = kind === "date";
  const working = busy === kind;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy !== null, busy: working }}
      disabled={busy !== null}
      onPress={onPress}
      style={({ pressed }) => [
        styles.planButton,
        dark ? styles.planDark : styles.planMuted,
        (pressed || (busy !== null && !working)) && styles.pressed,
      ]}
    >
      {working ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={[styles.planLabel, dark && styles.onDark]}>{label}</Text>
          <Text style={[styles.planHint, dark && styles.onDark]}>{hint}</Text>
        </>
      )}
    </Pressable>
  );
}

export default function CityScreen() {
  useAppLocale();
  const { name } = useLocalSearchParams<{ name: string }>();
  const city = name ?? "";
  const items = useQuery(convexQuery(api.items.listCityItems, { city }));
  const cities = useQuery(convexQuery(api.items.listCities, {}));
  const { busy, start } = useCityPlan(city);
  const loaded = items.data !== undefined;
  const count = items.data?.length ?? 0;

  const opened = useRef(false);
  useEffect(() => {
    if (!loaded || opened.current) return;
    opened.current = true;
    analytics.capture("city_opened", { count });
  }, [loaded, count]);

  if (items.isError) {
    return (
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
    );
  }
  if (items.data === undefined) return <ScreenLoader />;
  const entry = cities.data?.find((c) => c.city === city);

  return (
    <View style={styles.container}>
      <FlatList
        data={items.data}
        keyExtractor={(item) => item._id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <CityCover
              city={city}
              count={entry?.count ?? count}
              cover={entry?.cover ?? null}
              height={COVER_HEIGHT}
            />
            {count > 0 ? (
              <View style={styles.plans}>
                <PlanButton
                  kind="date"
                  busy={busy}
                  onPress={() => void start("date")}
                />
                <PlanButton
                  kind="trip"
                  busy={busy}
                  onPress={() => void start("trip")}
                />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <SaveRow item={item} />}
        ListEmptyComponent={
          <EmptyState
            title={t("homePlaces.emptyTitle")}
            message={t("homePlaces.emptyBody")}
          />
        }
      />
      <HeaderScrim />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(4),
  },
  header: { gap: theme.gap(1.5), paddingBottom: theme.gap(1) },
  plans: { flexDirection: "row", gap: theme.gap(1.5) },
  planButton: {
    flex: 1,
    minHeight: theme.control.minHeight,
    gap: theme.gap(0.25),
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
  },
  planDark: { backgroundColor: theme.colors.foreground },
  planMuted: { backgroundColor: theme.colors.surfaceMuted },
  planLabel: { ...theme.type.button, color: theme.colors.foreground },
  planHint: { ...theme.type.caption, color: theme.colors.muted },
  onDark: { color: theme.colors.surface },
  pressed: { opacity: theme.opacity.pressed },
}));
