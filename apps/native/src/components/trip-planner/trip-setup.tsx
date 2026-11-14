import { AddPlaceSearch } from "@/components/add-place-sheet";
import { AppSymbolIcon } from "@/components/symbol";
import {
  CityPicker,
  DaysStepper,
  FormSection,
} from "@/components/trip-planner/trip-planner-form";
import { TripCountryPicker } from "@/components/trip-planner/trip-country-picker";
import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { isDarkThemeName } from "@/lib/appearance";
import { usePaywallGuard } from "@/lib/entitlement";
import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { MAX_TRIP_DAYS, toDateKey, tripDayDate } from "@/lib/trip";
import { usePlaceSearch } from "@/lib/trip-edit";
import {
  cityChoices,
  countryFlag,
  sameCity,
  tripCountryLine,
  tripCoverUri,
} from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import { MAX_TRIP_COVER_CHARS } from "@convex/model/tripCountries";
import { MAX_TRIP_NAME_CHARS, type TripPlace } from "@convex/model/tripPlan";
import { middleOf, type LatLng } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useQuery } from "@tanstack/react-query";
import { useAction, useMutation } from "convex/react";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { AppleMaps, GoogleMaps, type Coordinates } from "expo-maps";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Stage = "setup" | "countries" | "stay" | "hotel" | "pin";

type TripDraft = {
  name: string;
  countries: string[];
  city: string;
  cityLocation?: LatLng;
  cover?: string;
  dated: boolean;
  start: Date;
  end: Date;
  days: number;
};

function shiftDate(date: Date, days: number) {
  return tripDayDate(toDateKey(date), days) ?? date;
}

function duration(start: Date, end: Date) {
  return (
    (Date.parse(toDateKey(end)) - Date.parse(toDateKey(start))) / 86_400_000 + 1
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: Date;
  min: Date;
  max?: Date;
  onChange: (date: Date) => void;
}) {
  const { theme, rt } = useUnistyles();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.dateField}>
      <AppSymbolIcon name="calendar" size={18} tintColor={theme.colors.muted} />
      <ThemedText variant="body" style={styles.countryName}>
        {label}
      </ThemedText>
      {Platform.OS === "ios" ? (
        <DateTimePicker
          mode="date"
          display="compact"
          themeVariant={isDarkThemeName(rt.themeName) ? "dark" : "light"}
          accentColor={theme.colors.primary}
          style={styles.datePicker}
          locale={formattingLocale()}
          value={value}
          minimumDate={min}
          maximumDate={max}
          onValueChange={(_, date) => onChange(date)}
        />
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
            <ThemedText variant="bodyLabel">
              {value.toLocaleDateString(formattingLocale())}
            </ThemedText>
          </Pressable>
          {open ? (
            <DateTimePicker
              mode="date"
              value={value}
              minimumDate={min}
              maximumDate={max}
              onChange={(event, date) => {
                setOpen(false);
                if (event.type === "set" && date) onChange(date);
              }}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

async function selectCover() {
  const { launchImageLibraryAsync } = await import("expo-image-picker");
  const selection = await launchImageLibraryAsync({
    mediaTypes: ["images"],
    exif: false,
  });
  if (selection.canceled) return undefined;
  const asset = selection.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  context.resize(
    asset.width >= asset.height ? { width: 320 } : { height: 320 },
  );
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.68,
    base64: true,
  });
  if (!saved.base64 || saved.base64.length > MAX_TRIP_COVER_CHARS)
    throw new Error("Trip cover is too large");
  return saved.base64;
}

function TripBasics({
  draft,
  update,
  onCountries,
  onContinue,
  onGenerate,
}: {
  draft: TripDraft;
  update: (patch: Partial<TripDraft>) => void;
  onCountries: () => void;
  onContinue: () => void;
  onGenerate: () => void;
}) {
  const { theme } = useUnistyles();
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const pickCover = async () => {
    if (coverBusy) return;
    setCoverBusy(true);
    setCoverError(false);
    try {
      const cover = await selectCover();
      if (cover) update({ cover });
    } catch (error) {
      analytics.captureError("trip_cover_pick_failed", error);
      setCoverError(true);
    } finally {
      setCoverBusy(false);
    }
  };
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("tripSetup.cover")}
        onPress={() => void pickCover()}
        accessibilityState={{ busy: coverBusy }}
        disabled={coverBusy}
        style={styles.cover}
      >
        {draft.cover ? (
          <Image source={tripCoverUri(draft.cover)} style={styles.coverImage} />
        ) : (
          <>
            <AppSymbolIcon
              name="photo.on.rectangle"
              size={25}
              tintColor={theme.colors.primaryText}
            />
            <ThemedText variant="footnote" style={styles.coverLabel}>
              {t("tripSetup.cover")}
            </ThemedText>
          </>
        )}
      </Pressable>
      {coverError ? (
        <ThemedText accessibilityRole="alert" style={styles.problem}>
          {t("tripSetup.coverFailed")}
        </ThemedText>
      ) : null}
      <FormSection title={t("tripPlanner.nameLabel")}>
        <TextInput
          testID="trip-setup-name"
          accessibilityLabel={t("tripPlanner.nameLabel")}
          value={draft.name}
          onChangeText={(name) => update({ name })}
          maxLength={MAX_TRIP_NAME_CHARS}
          autoCapitalize="sentences"
          returnKeyType="done"
          style={styles.input}
        />
      </FormSection>
      <FormSection title={t("tripSetup.countries")}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("tripSetup.chooseCountries")}
          accessibilityValue={{ text: tripCountryLine(draft.countries) }}
          style={styles.dateField}
          onPress={onCountries}
        >
          <AppSymbolIcon
            name="safari"
            size={18}
            tintColor={theme.colors.muted}
          />
          <ThemedText variant="body" style={styles.countryName}>
            {draft.countries.length
              ? draft.countries
                  .map((code) => `${countryFlag(code)} ${code}`)
                  .join("  ")
              : t("tripSetup.addCountries")}
          </ThemedText>
          <AppSymbolIcon
            name="chevron.right"
            size={14}
            tintColor={theme.colors.muted}
          />
        </Pressable>
      </FormSection>
      <FormSection
        title={t(draft.dated ? "tripSetup.dates" : "trip.howManyDays")}
      >
        {draft.dated ? (
          <>
            <DateField
              label={t("tripSetup.startDate")}
              value={draft.start}
              min={shiftDate(new Date(), 0)}
              onChange={(start) => {
                const days = Math.min(
                  MAX_TRIP_DAYS,
                  Math.max(1, duration(start, draft.end)),
                );
                update({ start, end: shiftDate(start, days - 1) });
              }}
            />
            <DateField
              label={t("tripSetup.endDate")}
              value={draft.end}
              min={draft.start}
              max={shiftDate(draft.start, MAX_TRIP_DAYS - 1)}
              onChange={(end) => update({ end })}
            />
          </>
        ) : (
          <DaysStepper
            days={draft.days}
            onChange={(days) => update({ days })}
          />
        )}
        <Pressable
          accessibilityRole="button"
          style={styles.trailingLink}
          onPress={() => update({ dated: !draft.dated })}
        >
          <ThemedText variant="bodyLabel" style={styles.accent}>
            {t(draft.dated ? "tripSetup.useDays" : "tripSetup.useDates")}
          </ThemedText>
        </Pressable>
      </FormSection>
      <Button
        title={t("tripSetup.start")}
        testID="trip-setup-continue"
        disabled={!draft.name.trim() || draft.countries.length === 0}
        onPress={onContinue}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onGenerate}
        style={styles.link}
      >
        <ThemedText variant="bodyLabel" style={styles.accent}>
          {t("tripSetup.generate")}
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

function StayStep({
  draft,
  update,
  onHotel,
  onPin,
  onBase,
  base,
  onCreate,
  busy,
  failed,
}: {
  draft: TripDraft;
  update: (patch: Partial<TripDraft>) => void;
  onHotel: () => void;
  onPin: () => void;
  onBase: () => void;
  base: LatLng | null;
  onCreate: () => void;
  busy: boolean;
  failed: boolean;
}) {
  const cities = useQuery(convexQuery(api.items.listCities, {}));
  const choices = useMemo(() => cityChoices(cities.data ?? []), [cities.data]);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <ThemedText variant="largeTitle" accessibilityRole="header">
        {t("tripPlanner.stay")}
      </ThemedText>
      <ThemedText style={styles.muted}>
        {tripCountryLine(draft.countries)}
      </ThemedText>
      <FormSection title={t("tripSetup.baseCity")}>
        <CityPicker
          cities={choices}
          value={draft.city}
          onChange={(city, cityLocation) => update({ city, cityLocation })}
        />
      </FormSection>
      <Button
        title={t("tripSetup.searchHotel")}
        disabled={busy}
        onPress={onHotel}
      />
      {base ? (
        <Button
          title={t("tripSetup.stayNearSaves")}
          disabled={busy}
          onPress={onBase}
        />
      ) : null}
      <Button title={t("tripSetup.dropPin")} disabled={busy} onPress={onPin} />
      <Button
        title={t("tripSetup.decideLater")}
        loading={busy}
        onPress={onCreate}
      />
      {failed ? (
        <ThemedText accessibilityRole="alert" style={styles.problem}>
          {t("tripPlanner.editFailed")}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}

function PinStep({
  base,
  busy,
  failed,
  onPick,
}: {
  base: LatLng | null;
  busy: boolean;
  failed: boolean;
  onPick: (place: TripPlace) => void;
}) {
  const [pin, setPin] = useState<LatLng | null>(null);
  const cameraPosition = useMemo(
    () =>
      base
        ? { coordinates: { latitude: base.lat, longitude: base.lng }, zoom: 12 }
        : undefined,
    [base],
  );
  const markers = pin
    ? [
        {
          id: "trip-stay",
          coordinates: { latitude: pin.lat, longitude: pin.lng },
        },
      ]
    : [];
  const pick = ({ coordinates }: { coordinates: Coordinates }) => {
    if (
      coordinates.latitude !== undefined &&
      coordinates.longitude !== undefined
    )
      setPin({ lat: coordinates.latitude, lng: coordinates.longitude });
  };
  return (
    <View style={styles.grow}>
      {Platform.OS === "ios" ? (
        <AppleMaps.View
          style={styles.grow}
          cameraPosition={cameraPosition}
          markers={markers}
          onMapClick={pick}
        />
      ) : (
        <GoogleMaps.View
          style={styles.grow}
          cameraPosition={cameraPosition}
          markers={markers}
          onMapClick={pick}
        />
      )}
      <View style={styles.content}>
        <Button
          title={t("tripSetup.usePin")}
          disabled={!pin}
          loading={busy}
          onPress={() => pin && onPick({ name: t("tripSetup.mapPin"), ...pin })}
        />
        {failed ? (
          <ThemedText accessibilityRole="alert" style={styles.problem}>
            {t("tripPlanner.editFailed")}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function HotelStep({
  countries,
  city,
  busy,
  failed,
  onPick,
}: {
  countries: string[];
  city: string;
  busy: boolean;
  failed: boolean;
  onPick: (place: TripPlace) => void;
}) {
  const locale = useAppLocale();
  const [query, setQuery] = useState("");
  const search = useAction(api.tripPlanner.searchTripStays);
  const run = useCallback(
    (text: string) => search({ query: text, countries, city, locale }),
    [search, countries, city, locale],
  );
  const result = usePlaceSearch(run, query);
  return (
    <>
      <AddPlaceSearch
        testID="trip-setup-hotel"
        city={city || tripCountryLine(countries)}
        query={query}
        onQueryChange={setQuery}
        search={result}
        busy={busy}
        addedLabel={t("tripPlanner.onTrip")}
        isAdded={() => false}
        onPickFound={onPick}
        saved={null}
      />
      {failed ? (
        <ThemedText accessibilityRole="alert" style={styles.problem}>
          {t("tripPlanner.editFailed")}
        </ThemedText>
      ) : null}
    </>
  );
}

export function TripSetup({
  city,
  onGenerate,
  onClose,
}: {
  city?: string;
  onGenerate: () => void;
  onClose: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const navigation = useNavigation();
  const [stage, setStage] = useState<Stage>("setup");
  const [draft, setDraft] = useState<TripDraft>(() => {
    const start = shiftDate(new Date(), 0);
    return {
      name: "",
      countries: [],
      city: city ?? "",
      dated: true,
      start,
      end: shiftDate(start, 6),
      days: 5,
    };
  });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const create = useMutation(api.tripPlannerData.createBlankTrip);
  const { guard } = usePaywallGuard("plan_trip");
  const pins = useQuery(
    convexQuery(
      api.mapPlaces.listMapPlaces,
      stage === "stay" || stage === "pin" ? {} : "skip",
    ),
  );
  const base = useMemo(
    () =>
      middleOf(
        (pins.data ?? []).filter(
          (pin) => pin.city && sameCity(pin.city, draft.city),
        ),
      ),
    [pins.data, draft.city],
  );
  const pinStart = base ?? draft.cityLocation ?? null;
  const update = (patch: Partial<TripDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const go = (next: Stage) => {
    Keyboard.dismiss();
    setFailed(false);
    setStage(next);
  };
  const submit = async (stay?: TripPlace) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      if (!(await guard()) || !navigation.isFocused()) return;
      const {
        name,
        countries,
        cover,
        city: destination,
        dated,
        start,
        end,
        days,
      } = draft;
      const id = await create({
        name,
        countries,
        city: destination,
        dayCount: dated ? duration(start, end) : days,
        ...(dated ? { startDate: toDateKey(start) } : {}),
        ...(cover ? { cover } : {}),
        ...(stay
          ? { stay: { name: stay.name, lat: stay.lat, lng: stay.lng } }
          : {}),
      });
      if (navigation.isFocused())
        router.replace({ pathname: "/trip-plan/[id]", params: { id } });
    } catch (error) {
      analytics.captureError("create_blank_trip_failed", error);
      setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const back = () => {
    if (stage === "setup") onClose();
    else go(stage === "hotel" || stage === "pin" ? "stay" : "setup");
  };
  const titles = {
    setup: "tripSetup.title",
    countries: "tripSetup.chooseCountries",
    stay: "tripPlanner.stay",
    hotel: "tripSetup.searchHotel",
    pin: "tripSetup.dropPin",
  } as const;
  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            stage === "setup" ? "common.close" : "common.back",
          )}
          disabled={busy}
          style={styles.link}
          onPress={back}
        >
          <AppSymbolIcon
            name={stage === "setup" ? "xmark" : "chevron.left"}
            size={21}
            tintColor={theme.colors.foreground}
          />
        </Pressable>
        {stage === "stay" ? null : (
          <ThemedText
            variant="title"
            style={styles.toolbarTitle}
            accessibilityRole="header"
          >
            {t(titles[stage])}
          </ThemedText>
        )}
        {stage === "countries" ? (
          <Pressable
            accessibilityRole="button"
            style={styles.link}
            onPress={() => go("setup")}
          >
            <ThemedText variant="bodyLabel" style={styles.accent}>
              {t("common.done")}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {stage === "setup" ? (
        <TripBasics
          draft={draft}
          update={update}
          onCountries={() => go("countries")}
          onContinue={() => go("stay")}
          onGenerate={onGenerate}
        />
      ) : null}
      {stage === "countries" ? (
        <TripCountryPicker
          countries={draft.countries}
          onChange={(countries) => update({ countries })}
        />
      ) : null}
      {stage === "stay" ? (
        <StayStep
          draft={draft}
          update={update}
          busy={busy}
          failed={failed}
          onHotel={() => go("hotel")}
          onPin={() => go("pin")}
          base={base}
          onBase={() => base && void submit({ name: draft.city, ...base })}
          onCreate={() => void submit()}
        />
      ) : null}
      {stage === "hotel" ? (
        <HotelStep
          countries={draft.countries}
          city={draft.city}
          busy={busy}
          failed={failed}
          onPick={(place) => void submit(place)}
        />
      ) : null}
      {stage === "pin" ? (
        <PinStep
          base={pinStart}
          busy={busy}
          failed={failed}
          onPick={(place) => void submit(place)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  grow: { flex: 1 },
  screen: { flex: 1, backgroundColor: theme.colors.background },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1),
    paddingTop: Platform.OS === "android" ? rt.insets.top : 0,
  },
  toolbarTitle: { flex: 1, paddingVertical: theme.gap(1) },
  content: {
    gap: theme.gap(2),
    padding: theme.gap(2.5),
    paddingBottom: theme.gap(4),
  },
  input: {
    ...theme.type.body,
    minHeight: theme.control.minHeight,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.gap(1.5),
  },
  dateField: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  datePicker: { minWidth: 132 },
  cover: {
    alignSelf: "center",
    width: 104,
    height: 104,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: "dashed",
    overflow: "hidden",
    gap: theme.gap(0.5),
    padding: theme.gap(1),
  },
  coverLabel: { textAlign: "center", color: theme.colors.muted },
  coverImage: { ...StyleSheet.absoluteFillObject },
  countryName: { flex: 1 },
  muted: { color: theme.colors.muted },
  accent: { color: theme.colors.primaryText },
  problem: { color: theme.colors.danger },
  link: {
    minHeight: theme.control.minHeight,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.gap(1),
  },
  trailingLink: {
    minHeight: theme.control.minHeight,
    alignSelf: "flex-end",
    justifyContent: "center",
  },
}));
