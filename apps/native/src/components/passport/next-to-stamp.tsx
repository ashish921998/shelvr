import { CityRing } from "@/components/passport/city-ring";
import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import type { UnstampedPlace } from "@/lib/passport";
import type { CityCompletion } from "@convex/model/cityCompletion";
import { Image } from "expo-image";
import { Pressable, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const placeId = (place: UnstampedPlace) =>
  `${place.itemId}|${place.name}|${place.spot.lat},${place.spot.lng}`;

function PlaceRow({
  place,
  busy,
  onStamp,
}: {
  place: UnstampedPlace;
  busy: boolean;
  onStamp: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.row}>
      <View style={styles.thumb}>
        {place.cover ? (
          <Image
            source={{ uri: place.cover }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <AppSymbolIcon
            name="mappin"
            size={16}
            tintColor={theme.colors.primaryText}
          />
        )}
      </View>
      <View style={styles.rowText}>
        <ThemedText variant="subheadStrong" numberOfLines={1}>
          {place.name}
        </ThemedText>
        {place.title ? (
          <ThemedText variant="footnote" style={styles.muted} numberOfLines={1}>
            {place.title}
          </ThemedText>
        ) : null}
      </View>
      <Pressable
        testID="next-to-stamp-stamp"
        accessibilityRole="button"
        accessibilityLabel={t("passport.stampPlaceLabel", { name: place.name })}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        hitSlop={8}
        onPress={onStamp}
        style={({ pressed }) => [
          styles.stamp,
          busy && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <ThemedText variant="subheadStrong" style={styles.stampText}>
          {t("passport.stampPlace")}
        </ThemedText>
      </Pressable>
    </View>
  );
}

export function NextToStampList({
  city,
  places,
  completion,
  busy,
  onStamp,
}: {
  city: string;
  places: readonly UnstampedPlace[];
  completion: CityCompletion | undefined;
  busy: boolean;
  onStamp: (place: UnstampedPlace) => void;
}) {
  useAppLocale();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <View style={styles.summary}>
        {completion ? (
          <CityRing
            stamped={completion.stamped}
            total={completion.total}
            city={completion.city}
            size={48}
          />
        ) : null}
        <View style={styles.summaryText}>
          <ThemedText variant="title" numberOfLines={2}>
            {city}
          </ThemedText>
          <ThemedText variant="subhead" style={styles.muted}>
            {places.length > 0
              ? t("passport.nextBody", { count: places.length, city })
              : completion && completion.stamped >= completion.total
                ? t("passport.cityAllStamped", { city })
                : t("passport.nextEmpty", { city })}
          </ThemedText>
        </View>
      </View>
      <View>
        {places.map((place) => (
          <PlaceRow
            key={placeId(place)}
            place={place}
            busy={busy}
            onStamp={() => onStamp(place)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  content: {
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(3),
  },
  summary: { flexDirection: "row", alignItems: "center", gap: theme.gap(1.5) },
  summaryText: { flex: 1, gap: theme.gap(0.25) },
  row: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  thumb: {
    width: 44,
    height: 44,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  rowText: { flex: 1, gap: theme.gap(0.25) },
  stamp: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: theme.gap(1.75),
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.primaryText,
    backgroundColor: theme.colors.primarySoft,
  },
  stampText: { color: theme.colors.primaryText },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
  disabled: { opacity: theme.opacity.disabled },
}));
