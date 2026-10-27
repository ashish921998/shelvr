import { Segmented, StartDate } from "@/components/trip/trip-plan-form";
import {
  CityPicker,
  DaysStepper,
  FormSection,
  InterestChips,
  StayField,
} from "@/components/trip-planner/trip-planner-form";
import { TripPlannerReveal } from "@/components/trip-planner/trip-planner-reveal";
import { Button } from "@/components/ui/button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { useCreateTripPlan } from "@/lib/create-trip-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import {
  cityChoices,
  clampDays,
  initialTripForm,
  paceHint,
  paceLabel,
  TRIP_PACES,
  type TripForm,
  tripPlanMessage,
} from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function NewTripScreen() {
  const locale = useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { city: cityParam } = useLocalSearchParams<{ city?: string }>();
  const [form, setForm] = useState<TripForm>(() => initialTripForm(cityParam));
  const cities = useQuery(convexQuery(api.items.listCities, {}));
  const choices = useMemo(() => cityChoices(cities.data ?? []), [cities.data]);
  const { state, submit, open, loading } = useCreateTripPlan(locale, choices);
  const update = (patch: Partial<TripForm>) =>
    setForm((current) => ({ ...current, ...patch }));
  const close = () => backOrHome(router);

  const ready = state.status === "ready";
  useEffect(() => {
    if (ready && process.env.EXPO_OS === "ios") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [ready]);

  const header = (
    <>
      <Stack.Screen
        options={{
          title: t("tripPlanner.planTrip"),
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
    </>
  );

  if (state.status !== "idle") {
    return (
      <View style={styles.screen}>
        {header}
        <TripPlannerReveal city={state.city} ready={ready} onDone={open} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      >
        <FormSection title={t("tripPlanner.whereTo")}>
          <CityPicker
            cities={choices}
            value={form.city}
            onChange={(city) => update({ city })}
          />
        </FormSection>

        <FormSection title={t("trip.howManyDays")}>
          <DaysStepper
            days={form.days}
            onChange={(days) => update({ days: clampDays(days) })}
          />
          <View style={styles.row}>
            <ThemedText variant="bodyLabel">{t("trip.starting")}</ThemedText>
            <StartDate
              value={form.startDate}
              onChange={(startDate) => update({ startDate })}
            />
          </View>
        </FormSection>

        <FormSection
          title={t("tripPlanner.interests")}
          hint={t("tripPlanner.interestsHint")}
        >
          <InterestChips
            selected={form.interests}
            onChange={(interests) => update({ interests })}
          />
        </FormSection>

        <View style={styles.pace}>
          <Segmented
            label={t("trip.pace")}
            values={TRIP_PACES.map(paceLabel)}
            selected={TRIP_PACES.indexOf(form.pace)}
            onSelect={(index) =>
              update({ pace: TRIP_PACES[index] ?? form.pace })
            }
          />
          <ThemedText variant="caption" style={styles.muted}>
            {paceHint(form.pace)}
          </ThemedText>
        </View>

        <FormSection title={t("tripPlanner.stay")}>
          <StayField value={form.stay} onChange={(stay) => update({ stay })} />
        </FormSection>
      </ScrollView>
      <View style={styles.footer}>
        {state.problem ? (
          <ThemedText
            variant="footnote"
            style={styles.problem}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {tripPlanMessage(state.problem)}
          </ThemedText>
        ) : null}
        <Button
          testID="new-trip-submit"
          title={t("trip.make")}
          loading={loading}
          onPress={() => void submit(form)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    gap: theme.gap(3),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(3),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: theme.control.minHeight,
    gap: theme.gap(2),
  },
  pace: { gap: theme.gap(0.75) },
  muted: { color: theme.colors.muted },
  footer: {
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(1.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  problem: { color: theme.colors.danger, textAlign: "center" },
}));
