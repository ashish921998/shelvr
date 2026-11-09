import { Button } from "@/components/ui/button";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import {
  MAX_TRIP_STOP_NOTE_CHARS,
  TRIP_STOP_TIME,
  type TripPlanStop,
} from "@convex/model/tripPlan";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Alert, TextInput } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function TripStopDetailsSheet({
  stop,
  onClose,
}: {
  stop: TripPlanStop;
  onClose: () => void;
}) {
  const { theme } = useUnistyles();
  const update = useMutation(api.tripPlannerData.updateTripStopDetails);
  const [time, setTime] = useState(stop.time ?? "");
  const [note, setNote] = useState(stop.note ?? "");
  const [saving, setSaving] = useState(false);
  const validTime = time === "" || TRIP_STOP_TIME.test(time);

  const save = async () => {
    if (saving || !validTime) return;
    setSaving(true);
    try {
      await update({
        stopId: stop._id,
        time: time || null,
        note: note.trim() || null,
      });
      onClose();
    } catch (error) {
      analytics.captureError("trip_stop_details_failed", error);
      Alert.alert(t("tripPlanner.editFailed"));
      setSaving(false);
    }
  };

  return (
    <PromptSheet
      visible
      onClose={() => {
        if (!saving) onClose();
      }}
      title={t("tripPlanner.stopDetails")}
      body={stop.name}
      actions={
        <Button
          title={t("common.save")}
          disabled={!validTime}
          loading={saving}
          onPress={() => void save()}
        />
      }
    >
      <ThemedText variant="labelStrong">{t("tripPlanner.stopTime")}</ThemedText>
      <TextInput
        accessibilityLabel={t("tripPlanner.stopTime")}
        value={time}
        onChangeText={setTime}
        placeholder={t("tripPlanner.stopTimeExample")}
        placeholderTextColor={theme.colors.muted}
        autoCorrect={false}
        editable={!saving}
        maxLength={5}
        style={styles.input}
      />
      {!validTime ? (
        <ThemedText variant="footnote" style={styles.error}>
          {t("tripPlanner.stopTimeInvalid")}
        </ThemedText>
      ) : null}
      <ThemedText variant="labelStrong">{t("tripPlanner.stopNote")}</ThemedText>
      <TextInput
        accessibilityLabel={t("tripPlanner.stopNote")}
        value={note}
        onChangeText={setNote}
        placeholder={t("tripPlanner.stopNoteExample")}
        placeholderTextColor={theme.colors.muted}
        editable={!saving}
        multiline
        maxLength={MAX_TRIP_STOP_NOTE_CHARS}
        style={[styles.input, styles.note]}
      />
    </PromptSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  input: {
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.gap(1.5),
    paddingVertical: theme.gap(1),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.foreground,
    fontFamily: theme.type.body.fontFamily,
    fontSize: theme.type.body.fontSize,
  },
  note: {
    minHeight: theme.gap(8),
    maxHeight: theme.gap(12),
    textAlignVertical: "top",
  },
  error: { color: theme.colors.danger },
}));
