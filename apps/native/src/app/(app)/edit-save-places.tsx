import { useState } from "react";
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { EmptyState } from "@/components/empty-state";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";

type PlacesData = NonNullable<
  FunctionReturnType<typeof api.placeCorrections.getPlaces>
>;
type Place = PlacesData["places"][number];

function PlacesEditor({
  itemId,
  data,
}: {
  itemId: Id<"items">;
  data: PlacesData;
}) {
  const router = useRouter();
  const [places, setPlaces] = useState(data.places);
  const [version] = useState(data.version);
  const [city, setCity] = useState(data.places[0]?.city ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(Place & { area?: string })[]>([]);
  const [replace, setReplace] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const search = useAction(api.placeCorrectionSearch.search);
  const save = useMutation(api.placeCorrections.savePlaces);

  const find = async () => {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true);
    setResults([]);
    try {
      const result = await search({ itemId, city, query });
      setResults(
        result.places.map((place) => ({
          ...place,
          city: city.trim(),
        })),
      );
      if (!result.available) Alert.alert(t("tripPlanner.searchUnavailable"));
      else if (result.places.length === 0)
        Alert.alert(t("tripPlanner.searchEmpty"));
    } catch (error) {
      analytics.captureError("place_correction_search_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await save({ itemId, version, places });
      backOrHome(router);
    } catch (error) {
      analytics.captureError("place_correction_save_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("placeCorrection.retry"));
    } finally {
      setBusy(false);
    }
  };
  const choose = ({ area: _area, ...place }: Place & { area?: string }) => {
    setPlaces((old) =>
      replace === null
        ? [...old, place]
        : old.map((value, index) => (index === replace ? place : value)),
    );
    setReplace(null);
    setResults([]);
    setQuery("");
  };
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText>{t("placeCorrection.hint")}</ThemedText>
      {places.map((place, index) => (
        <View key={`${index}-${place.name}`} style={styles.row}>
          <ThemedText variant="subheadStrong">{place.name}</ThemedText>
          <ThemedText variant="footnote">{place.city ?? ""}</ThemedText>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setReplace(index);
                setCity(place.city ?? "");
                setQuery(place.name);
                setResults([]);
              }}
            >
              <ThemedText>{t("placeCorrection.replace")}</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setPlaces((old) => old.filter((_, i) => i !== index));
                setReplace(null);
                setResults([]);
              }}
            >
              <ThemedText>{t("placeCorrection.remove")}</ThemedText>
            </Pressable>
          </View>
        </View>
      ))}
      <ThemedText variant="subheadStrong">
        {replace === null
          ? t("tripPlanner.addPlace")
          : t("placeCorrection.replace")}
      </ThemedText>
      <TextInput
        style={styles.input}
        accessibilityLabel={t("placeCorrection.city")}
        placeholder={t("placeCorrection.city")}
        value={city}
        editable={!busy}
        maxLength={80}
        onChangeText={(value) => {
          setCity(value);
          setResults([]);
        }}
      />
      <TextInput
        style={styles.input}
        testID="place-correction-search"
        accessibilityLabel={t("placeCorrection.search")}
        placeholder={t("placeCorrection.search")}
        value={query}
        editable={!busy}
        maxLength={100}
        onChangeText={(value) => {
          setQuery(value);
          setResults([]);
        }}
      />
      <Button
        title={t("placeCorrection.search")}
        disabled={busy || !city.trim() || query.trim().length < 2}
        onPress={() => void find()}
      />
      {results.map((place, index) => (
        <Pressable
          key={`${index}-${place.name}`}
          accessibilityRole="button"
          onPress={() => choose(place)}
          style={styles.row}
        >
          <ThemedText variant="subheadStrong">{place.name}</ThemedText>
          <ThemedText variant="footnote">
            {[place.area, place.city].filter(Boolean).join(", ")}
          </ThemedText>
        </Pressable>
      ))}
      <Button
        title={t("placeCorrection.save")}
        loading={busy}
        onPress={() => void commit()}
      />
    </ScrollView>
  );
}

export default function EditSavePlacesScreen() {
  useAppLocale();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const id = itemId as Id<"items">;
  const data = useQuery(
    convexQuery(api.placeCorrections.getPlaces, { itemId: id }),
  );
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t("placeCorrection.title") }} />
      {data.isError || data.data === null ? (
        <EmptyState
          title={t("errors.unexpectedTitle")}
          message={t("errors.retrySoon")}
        />
      ) : data.data === undefined ? (
        <ScreenLoader label={t("trip.loading")} />
      ) : !data.data.ready ? (
        <EmptyState
          title={t("placeCorrection.title")}
          message={t("placeCorrection.wait")}
        />
      ) : (
        <PlacesEditor key={id} itemId={id} data={data.data} />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.gap(3),
    gap: theme.gap(2),
    paddingBottom: theme.gap(8),
  },
  row: { gap: theme.gap(1), paddingVertical: theme.gap(2) },
  actions: {
    flexDirection: "row",
    gap: theme.gap(4),
    paddingVertical: theme.gap(1),
  },
  input: {
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface,
    padding: theme.gap(2),
    borderRadius: 12,
  },
}));
