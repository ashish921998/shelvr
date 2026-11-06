import { AppSymbolIcon } from "@/components/symbol";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import type { PlaceSearch } from "@/lib/trip-edit";
import type { TripPlace } from "@convex/model/tripPlan";
import { Stack } from "expo-router";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MAX_QUERY_LENGTH = 100;

function PlaceRow({
  name,
  detail,
  addedLabel,
  disabled,
  onPress,
}: {
  name: string;
  detail: string | undefined;
  addedLabel: string | null;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, detail, addedLabel].filter(Boolean).join(", ")}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.place, pressed && styles.pressed]}
    >
      <View style={styles.placeText}>
        <ThemedText variant="subheadStrong" numberOfLines={2}>
          {name}
        </ThemedText>
        {detail ? (
          <ThemedText variant="footnote" numberOfLines={1} style={styles.muted}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {addedLabel !== null ? (
        <ThemedText variant="caption" style={styles.muted}>
          {addedLabel}
        </ThemedText>
      ) : (
        <AppSymbolIcon
          name="plus.circle.fill"
          size={24}
          tintColor={theme.colors.primary}
        />
      )}
    </Pressable>
  );
}

function SearchNote({ search }: { search: PlaceSearch }) {
  const { theme } = useUnistyles();
  switch (search.status) {
    case "searching":
      return (
        <View
          style={styles.note}
          accessibilityLabel={t("tripPlanner.searching")}
        >
          <ActivityIndicator color={theme.colors.muted} />
        </View>
      );
    case "unavailable":
    case "failed":
      return (
        <ThemedText variant="footnote" style={[styles.note, styles.muted]}>
          {t("tripPlanner.searchUnavailable")}
        </ThemedText>
      );
    case "done":
      return search.places.length === 0 ? (
        <ThemedText variant="footnote" style={[styles.note, styles.muted]}>
          {t("tripPlanner.searchEmpty")}
        </ThemedText>
      ) : null;
    case "idle":
      return null;
  }
}

export function AddPlaceSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children?: ReactNode;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <Stack.Screen
        options={{
          title: t("tripPlanner.addPlace"),
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
                    onPress={onClose}
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
            onPress={onClose}
          >
            {t("common.close")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
      {children}
    </View>
  );
}

export function AddPlaceSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText variant="bodyLabel" accessibilityRole="header">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

export function AddPlaceSearch({
  testID,
  city,
  query,
  onQueryChange,
  search,
  busy,
  addedLabel,
  isAdded,
  onPickFound,
  saved,
  children,
}: {
  testID: string;
  city: string;
  query: string;
  onQueryChange: (text: string) => void;
  search: PlaceSearch;
  busy: boolean;
  addedLabel: string;
  isAdded: (place: TripPlace) => boolean;
  onPickFound: (place: TripPlace) => void;
  saved: {
    note?: string;
    rows: {
      key: string;
      name: string;
      detail: string | undefined;
      onPress: () => void;
    }[];
  } | null;
  children?: ReactNode;
}) {
  const { theme } = useUnistyles();
  const placeholder = t("tripPlanner.searchPlaceholder", { city });
  const results = search.status === "done" ? search.places : [];
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.content}
    >
      <TextInput
        testID={testID}
        value={query}
        onChangeText={onQueryChange}
        autoFocus
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel={placeholder}
        maxLength={MAX_QUERY_LENGTH}
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={styles.input}
      />
      {children}
      {query.trim().length > 0 ? (
        <AddPlaceSection title={t("tripPlanner.onAppleMaps")}>
          <SearchNote search={search} />
          {results.map((place) => (
            <PlaceRow
              key={place.appleId ?? `${place.name}-${place.lat}`}
              name={place.name}
              detail={place.area}
              addedLabel={isAdded(place) ? addedLabel : null}
              disabled={busy}
              onPress={() => onPickFound(place)}
            />
          ))}
        </AddPlaceSection>
      ) : null}
      {saved ? (
        <AddPlaceSection title={t("tripPlanner.fromSaves")}>
          {saved.note ? (
            <ThemedText variant="footnote" style={styles.muted}>
              {saved.note}
            </ThemedText>
          ) : null}
          {saved.rows.map(({ key, ...row }) => (
            <PlaceRow key={key} {...row} addedLabel={null} disabled={busy} />
          ))}
        </AddPlaceSection>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    gap: theme.gap(3),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(4),
  },
  input: {
    ...theme.type.body,
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    color: theme.colors.foreground,
  },
  section: { gap: theme.gap(1) },
  place: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.25),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  placeText: { flex: 1, gap: theme.gap(0.25) },
  note: { paddingVertical: theme.gap(1) },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));
