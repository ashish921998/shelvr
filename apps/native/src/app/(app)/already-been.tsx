import { EmptyState } from "@/components/empty-state";
import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { usePaywallGuard } from "@/lib/entitlement";
import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import { unstampedCities, type UnstampedPlace } from "@/lib/passport";
import { backOrHome } from "@/lib/screen-dismiss";
import { bulkStampMoment, useStampMoment } from "@/lib/stamp-moment";
import { api } from "@convex/_generated/api";
import { MAX_BATCH_PLACES } from "@convex/model/placeVisits";
import { saveErrorCode } from "@convex/model/saveErrors";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const pickId = (place: UnstampedPlace) =>
  `${place.itemId}|${place.name}|${place.spot.lat},${place.spot.lng}`;

function PlaceRow({
  place,
  selected,
  disabled,
  onPress,
}: {
  place: UnstampedPlace;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={place.name}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
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
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? (
          <AppSymbolIcon
            name="checkmark"
            size={14}
            weight="bold"
            tintColor={theme.colors.surface}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export default function AlreadyBeenScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const places = useQuery(convexQuery(api.placeVisits.listUnstampedPlaces, {}));
  const markVisitedBefore = useMutation(api.placeVisits.markVisitedBefore);
  const [pickedIds, setPickedIds] = useState<ReadonlySet<string>>(new Set());
  const picked = (places.data ?? []).filter((place) =>
    pickedIds.has(pickId(place)),
  );
  const [busy, setBusy] = useState(false);
  const { queue: queueStamp } = useStampMoment();
  useEffect(() => {
    if (places.error) {
      analytics.captureError("passport_picker_load_failed", places.error);
    }
  }, [places.error]);
  const close = useCallback(() => backOrHome(router), [router]);

  const toggle = (place: UnstampedPlace) => {
    const id = pickId(place);
    if (!pickedIds.has(id) && picked.length >= MAX_BATCH_PLACES) return;
    void haptics.selection();
    setPickedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { guard } = usePaywallGuard("passport");
  const active = useRef(true);
  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );

  const submit = async () => {
    if (busy || picked.length === 0) return;
    setBusy(true);
    try {
      const count = await markVisitedBefore({
        places: picked.map(({ itemId, name, spot }) => ({
          itemId,
          name,
          spot,
        })),
      });
      analytics.capture("passport_backfilled", { places: count });
      if (!active.current) return;
      const moment = bulkStampMoment(count, picked);
      if (moment) queueStamp(moment, "already_been");
      router.dismissTo("/passport");
    } catch (error) {
      analytics.captureError("passport_backfill_failed", error);
      if (!active.current) return;
      if (saveErrorCode(error) === "pro_required" && !(await guard())) return;
      if (!active.current) return;
      Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <>
      <Stack.Screen
        options={{
          title: t("passport.beenTitle"),
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

  if (places.isError || places.data === undefined) {
    return (
      <View style={styles.screen}>
        {header}
        {places.isError ? (
          <EmptyState
            title={t("errors.unexpectedTitle")}
            message={t("errors.retrySoon")}
          />
        ) : (
          <ScreenLoader />
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <ThemedText variant="body" style={styles.muted}>
          {places.data.length === 0
            ? t("passport.nothingToStamp")
            : t("passport.pickBody")}
        </ThemedText>
        {unstampedCities(places.data).map((group) => (
          <View key={group.city} style={styles.city}>
            <ThemedText variant="title">{group.city}</ThemedText>
            {group.places.map((place) => (
              <PlaceRow
                key={pickId(place)}
                place={place}
                selected={pickedIds.has(pickId(place))}
                disabled={
                  busy ||
                  (picked.length >= MAX_BATCH_PLACES &&
                    !pickedIds.has(pickId(place)))
                }
                onPress={() => toggle(place)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          testID="already-been-submit"
          title={
            picked.length === 0
              ? t("passport.pickNone")
              : t("passport.stampCount", { count: picked.length })
          }
          disabled={picked.length === 0}
          loading={busy}
          onPress={() => void submit()}
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
  city: { gap: theme.gap(0.5) },
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
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    borderColor: theme.colors.foreground,
    backgroundColor: theme.colors.foreground,
  },
  muted: { color: theme.colors.muted },
  footer: {
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(1.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  pressed: { opacity: theme.opacity.pressed },
  disabled: { opacity: theme.opacity.disabled },
}));
