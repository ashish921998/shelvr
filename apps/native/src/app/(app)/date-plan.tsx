import { DateEvening } from "@/components/date-plan/date-evening";
import { DateKindPicker } from "@/components/date-plan/date-kind-picker";
import { DateFirstSpotSheet } from "@/components/date-plan/date-first-spot-sheet";
import { EmptyState } from "@/components/empty-state";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { Button } from "@/components/ui/button";
import { emptyMessage, useDatePlan } from "@/lib/date-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { tidyCity } from "@convex/model/trip";
import { haptics } from "@/lib/haptics";
import { usePlanGate } from "@/lib/plan-gate";
import { personalPlanAllowed } from "@/lib/list-gate";
import type { Id } from "@convex/_generated/dataModel";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** Plan a date: "What kind of date?", then an evening of two stops from the city's saves. */
export default function DatePlanScreen() {
  const locale = useAppLocale();
  const { city: cityParam, listId } = useLocalSearchParams<{
    city?: string;
    listId?: string;
  }>();
  const city = tidyCity(cityParam ?? "");
  const { gated } = usePlanGate();
  const [pickingFirst, setPickingFirst] = useState(false);
  const { state, plan, swap, restart } = useDatePlan(
    city,
    locale,
    listId as Id<"sharedLists"> | undefined,
  );

  const ready = state.status === "ready";
  useEffect(() => {
    if (ready) {
      void haptics.success();
    }
  }, [ready]);

  // Without a title VoiceOver read the tab group's route name, "(tabs)".
  const backTitle = (
    <Stack.Screen options={{ headerBackTitle: t("common.back") }} />
  );

  if (!personalPlanAllowed(gated, listId))
    return <Redirect href="/plan-gate" />;

  switch (state.status) {
    case "planning":
      return (
        <>
          {backTitle}
          <View style={styles.loading}>
            <ScreenLoader label={t("datePlan.planning")} />
          </View>
        </>
      );
    case "ready":
      return (
        <>
          {backTitle}
          <DateEvening
            result={state.result}
            evening={state.evening}
            firstLocked={state.firstLocked}
            onSwap={swap}
            onRestart={restart}
          />
        </>
      );
    case "empty": {
      const { title, message } = emptyMessage(
        state.result,
        listId !== undefined,
      );
      return (
        <View style={styles.screen}>
          {backTitle}
          <EmptyState
            title={state.firstLocked ? t("datePlan.tryAnotherFirst") : title}
            message={
              state.firstLocked ? t("datePlan.firstUnavailable") : message
            }
          />
          <View style={styles.footer}>
            <Button
              title={t(
                state.firstLocked
                  ? "datePlan.pickFirst"
                  : "datePlan.changeKind",
              )}
              onPress={() => {
                restart();
                if (state.firstLocked) setPickingFirst(true);
              }}
            />
          </View>
        </View>
      );
    }
    case "picking":
      return (
        <>
          {backTitle}
          <ScrollView
            style={styles.screen}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.content}
          >
            <DateKindPicker
              city={city}
              onList={listId !== undefined}
              problem={
                state.problem === "rate_limited"
                  ? t("datePlan.rateLimited")
                  : state.problem === "error"
                    ? t("datePlan.failed")
                    : null
              }
              onPick={(ask) => void plan(ask)}
              onPickFirst={() => setPickingFirst(true)}
            />
          </ScrollView>
          <DateFirstSpotSheet
            visible={pickingFirst}
            city={city}
            listId={listId as Id<"sharedLists"> | undefined}
            onClose={() => setPickingFirst(false)}
            onPick={(firstSpot) => void plan("surprise", firstSpot)}
          />
        </>
      );
  }
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(4),
  },
  loading: { flex: 1 },
  footer: {
    paddingHorizontal: theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(2),
  },
}));
