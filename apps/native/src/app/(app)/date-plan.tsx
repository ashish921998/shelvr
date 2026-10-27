import { DateEvening } from "@/components/date-plan/date-evening";
import { DateKindPicker } from "@/components/date-plan/date-kind-picker";
import { EmptyState } from "@/components/empty-state";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { Button } from "@/components/ui/button";
import { emptyMessage, useDatePlan } from "@/lib/date-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { tidyCity } from "@convex/model/trip";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** Plan a date: "What kind of date?", then an evening of two stops from the city's saves. */
export default function DatePlanScreen() {
  const locale = useAppLocale();
  const { city: cityParam } = useLocalSearchParams<{ city?: string }>();
  const city = tidyCity(cityParam ?? "");
  const { state, plan, another, swap, restart } = useDatePlan(city, locale);

  const ready = state.status === "ready";
  useEffect(() => {
    if (ready && process.env.EXPO_OS === "ios") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [ready]);

  // Without a title VoiceOver read the tab group's route name, "(tabs)".
  const backTitle = (
    <Stack.Screen options={{ headerBackTitle: t("common.back") }} />
  );

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
            onAnother={another}
            onSwap={swap}
            onRestart={restart}
          />
        </>
      );
    case "empty": {
      const { title, message } = emptyMessage(state.result);
      return (
        <View style={styles.screen}>
          {backTitle}
          <EmptyState title={title} message={message} />
          <View style={styles.footer}>
            <Button title={t("datePlan.changeKind")} onPress={restart} />
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
              problem={
                state.problem === "rate_limited"
                  ? t("datePlan.rateLimited")
                  : state.problem === "error"
                    ? t("datePlan.failed")
                    : null
              }
              onPick={(ask) => void plan(ask)}
            />
          </ScrollView>
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
