import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { categoryEmoji } from "@/lib/map-pin-emoji";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { TripSavePlace } from "@convex/model/tripPlan";
import { useMutation, useQuery } from "convex/react";
import { Image } from "expo-image";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Draft = {
  queue: TripSavePlace[];
  alternatives: TripSavePlace[];
  kept: TripSavePlace[];
  reviewed: number;
};

function PreviewPlace({ place }: { place: TripSavePlace }) {
  const { theme } = useUnistyles();
  const [failed, setFailed] = useState(false);
  const item = useQuery(api.items.getItem, { id: place.itemId });
  const cover = failed ? null : (item?.imageUrl ?? item?.heroImageUrl);
  const emoji = place.category ? categoryEmoji(place.category) : undefined;
  return (
    <View style={styles.place}>
      <View style={[styles.artwork, !cover && styles.artworkFallback]}>
        {cover ? (
          <Image
            source={cover}
            style={styles.photo}
            contentFit="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={styles.placeBadge} accessibilityElementsHidden>
            {emoji ? (
              <ThemedText variant="largeTitle">{emoji}</ThemedText>
            ) : (
              <AppSymbolIcon
                name="mappin"
                size={28}
                tintColor={theme.colors.primaryText}
              />
            )}
          </View>
        )}
      </View>
      <View style={styles.placeCopy}>
        <ThemedText variant="captionLabel" style={styles.accent}>
          {t("tripPlanner.fromSaves")}
        </ThemedText>
        <ThemedText variant="title" accessibilityRole="header">
          {place.name}
        </ThemedText>
        {place.title && place.title !== place.name ? (
          <ThemedText variant="body" style={styles.muted}>
            {place.title}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

export function TripDayPreview({
  tripId,
  day,
  label,
  limit,
  places,
  onClose,
}: {
  tripId: Id<"tripPlans">;
  day: number;
  label: string;
  limit: number;
  places: TripSavePlace[];
  onClose: () => void;
}) {
  useAppLocale();
  const apply = useMutation(api.tripPlannerData.applyTripDaySuggestions);
  const [draft, setDraft] = useState<Draft>(() => ({
    queue: places.slice(0, limit),
    alternatives: places.slice(limit),
    kept: [],
    reviewed: 0,
  }));
  const [status, setStatus] = useState<"idle" | "busy" | "changed" | "failed">(
    "idle",
  );
  const pending = useRef(false);
  const current = draft.queue[0];
  const close = () => {
    if (!pending.current) onClose();
  };
  const advance = (keep: boolean) =>
    setDraft((state) => {
      const [place, ...queue] = state.queue;
      if (!place) return state;
      return {
        ...state,
        queue,
        kept: keep ? [...state.kept, place] : state.kept,
        reviewed: state.reviewed + 1,
      };
    });
  const swap = () =>
    setDraft((state) => {
      const [place, ...rest] = state.queue;
      const [alternative, ...others] = state.alternatives;
      if (!place || !alternative) return state;
      return {
        ...state,
        queue: [alternative, ...rest],
        alternatives: [...others, place],
      };
    });
  const commit = async () => {
    if (pending.current) return;
    pending.current = true;
    setStatus("busy");
    try {
      const saved = await apply({
        tripId,
        day,
        places: draft.kept.map(({ itemId, name }) => ({ itemId, name })),
      });
      if (saved) onClose();
      else setStatus("changed");
    } catch (error) {
      analytics.captureError("apply_trip_day_suggestions_failed", error);
      setStatus("failed");
    } finally {
      pending.current = false;
    }
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView
        style={styles.screen}
        edges={["top", "bottom"]}
        accessibilityViewIsModal
      >
        <View style={styles.toolbar}>
          <HeaderIconButton
            icon="xmark"
            label={t("common.close")}
            onPress={close}
            disabled={status === "busy"}
          />
          <ThemedText
            variant="header"
            accessibilityRole="header"
            style={styles.heading}
          >
            {t("tripSetup.fillDay")}
          </ThemedText>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.progress}>
            <ThemedText variant="bodyLabel" style={styles.heading}>
              {label}
            </ThemedText>
            {current ? (
              <ThemedText variant="caption" style={styles.muted}>
                {t("tripDay.progress", {
                  current: (draft.reviewed + 1).toLocaleString(
                    formattingLocale(),
                  ),
                  total: draft.reviewed + draft.queue.length,
                })}
              </ThemedText>
            ) : null}
          </View>
          {current ? (
            <PreviewPlace key={current.itemId + current.name} place={current} />
          ) : (
            <View style={styles.result}>
              <ThemedText variant="title" accessibilityRole="header">
                {draft.kept.length
                  ? t("tripDay.selectedStops")
                  : t("tripDay.noKept")}
              </ThemedText>
              {draft.kept.map((place) => (
                <ThemedText key={place.itemId + place.name} variant="body">
                  {place.name}
                </ThemedText>
              ))}
              {status === "changed" || status === "failed" ? (
                <ThemedText accessibilityRole="alert" style={styles.muted}>
                  {t(
                    status === "changed"
                      ? "tripDay.suggestionsChanged"
                      : "tripPlanner.editFailed",
                  )}
                </ThemedText>
              ) : null}
            </View>
          )}
        </ScrollView>
        <View style={styles.footer}>
          {current ? (
            <>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: draft.alternatives.length === 0,
                  }}
                  disabled={draft.alternatives.length === 0}
                  onPress={swap}
                  style={[
                    styles.swap,
                    draft.alternatives.length === 0 && styles.disabled,
                  ]}
                >
                  <ThemedText variant="bodyLabel">{t("trip.swap")}</ThemedText>
                </Pressable>
                <Button
                  title={t("tripDay.keep")}
                  onPress={() => advance(true)}
                  style={styles.keep}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                style={styles.skip}
                onPress={() => advance(false)}
              >
                <ThemedText variant="bodyLabel" style={styles.muted}>
                  {t("tripDay.skip")}
                </ThemedText>
              </Pressable>
            </>
          ) : draft.kept.length > 0 && status !== "changed" ? (
            <Button
              title={t("tripDay.addSelected")}
              loading={status === "busy"}
              onPress={() => void commit()}
            />
          ) : (
            <Button title={t("common.done")} onPress={close} />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(2),
  },
  heading: { flex: 1 },
  content: {
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(2.5),
    paddingBottom: theme.gap(2),
  },
  progress: { flexDirection: "row", alignItems: "center", gap: theme.gap(1) },
  place: {
    borderRadius: theme.radius.xl,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  artwork: {
    aspectRatio: 1.35,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  photo: { ...StyleSheet.absoluteFillObject },
  artworkFallback: { aspectRatio: 2.5 },
  placeBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  placeCopy: { padding: theme.gap(2), gap: theme.gap(0.75) },
  result: {
    gap: theme.gap(1.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  footer: {
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(1.5),
    paddingBottom: theme.gap(1),
    gap: theme.gap(0.5),
  },
  actions: { flexDirection: "row", gap: theme.gap(1) },
  keep: { flex: 1 },
  swap: {
    flex: 1,
    minHeight: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 999,
  },
  skip: {
    minHeight: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: { color: theme.colors.muted },
  accent: { color: theme.colors.primaryText },
  disabled: { opacity: theme.opacity.disabled },
}));
