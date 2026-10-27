import { StartDate } from "@/components/trip-planner/start-date";
import {
  CityPicker,
  DaysStepper,
  FormSection,
  InterestChips,
  PaceChips,
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
  type TripForm,
  tripFormProblem,
  tripPlanMessage,
} from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const close = useCallback(() => backOrHome(router), [router]);
  const problem = tripFormProblem(form);

  const ready = state.status === "ready";
  useEffect(() => {
    if (ready && process.env.EXPO_OS === "ios") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [ready]);

  // Memoised so a form change does not push new header options: each push re-lays out the
  // modal's navigation bar, and the form under it jumped a few points with every tap.
  const header = useMemo(
    () => (
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
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t()` reads the locale, so a language change must rebuild the header
    [theme, close, locale],
  );

  // The sheet is modal to VoiceOver too, so a swipe never leaves it for the Trips list behind.
  if (state.status !== "idle") {
    return (
      <View style={styles.screen} accessibilityViewIsModal>
        {header}
        <TripPlannerReveal city={state.city} ready={ready} onDone={open} />
      </View>
    );
  }

  return (
    <View style={styles.screen} accessibilityViewIsModal>
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

        <FormSection title={t("trip.pace")} hint={paceHint(form.pace)}>
          <PaceChips
            selected={form.pace}
            onChange={(pace) => update({ pace })}
          />
        </FormSection>

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
          disabled={problem !== null}
          accessibilityHint={
            problem === null ? undefined : tripPlanMessage({ kind: problem })
          }
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
