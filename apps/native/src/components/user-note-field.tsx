import type { DetailItem } from "@/components/item-detail";
import { analytics } from "@/lib/analytics";
import { openPaywall, useEntitlement } from "@/lib/entitlement";
import { t, useAppLocale } from "@/lib/i18n";
import { createLatestSaveQueue } from "@/lib/note-edit";
import { api } from "@convex/_generated/api";
import { MAX_USER_NOTE_CHARS } from "@convex/model/itemFields";
import { saveErrorCode } from "@convex/model/saveErrors";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, TextInput } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** Idle time after the last keystroke before the note saves. */
const SAVE_DELAY_MS = 800;
const PAYWALL_PLACEMENT = "item_detail";

/**
 * The owner's own note on a save: a line about why they kept it, edited in
 * place and saved as they type. Clearing it removes the note.
 *
 * Mount one per save (keyed by id). Until something is typed the field follows
 * the server; after that, what was typed stays for the visit.
 */
export function UserNoteField({ item }: { item: DetailItem }) {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const { entitled } = useEntitlement();
  const setNote = useMutation(api.items.setItemUserNote);
  const [draft, setDraft] = useState<string | null>(null);
  const [queue] = useState(() => {
    // The component is keyed by save id: one queue and edit event per visit.
    let reportedEdit = false;
    let alerted = false;
    return createLatestSaveQueue(
      async (note) => {
        await setNote({ id: item._id, note });
        alerted = false;
        if (!reportedEdit) {
          reportedEdit = true;
          analytics.itemAction(item, "user_note_edited");
        }
      },
      async (error) => {
        analytics.captureError("user_note_update_failed", error);
        if (saveErrorCode(error) === "pro_required") {
          await openPaywall(router, PAYWALL_PLACEMENT);
          return;
        }
        if (!alerted) {
          alerted = true;
          Alert.alert(t("errors.saveTitle"), t("errors.tryAgain"));
        }
      },
    );
  });

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => void queue.flush(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [queue, draft]);

  useEffect(() => {
    if (entitled) void queue.flush();
  }, [entitled, queue]);

  // Leaving the page, or swiping to another save, keeps what was typed.
  useEffect(() => () => void queue.flush(), [queue]);

  if (item.status !== "ready") return null;

  return (
    <TextInput
      value={draft ?? item.userNote ?? ""}
      onChangeText={(note) => {
        queue.change(note);
        setDraft(note);
      }}
      maxLength={MAX_USER_NOTE_CHARS}
      placeholder={t("item.userNotePlaceholder")}
      placeholderTextColor={theme.colors.muted}
      accessibilityLabel={t("item.userNoteLabel")}
      multiline
      scrollEnabled={false}
      textAlignVertical="top"
      style={styles.note}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  note: {
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    lineHeight: 23,
    color: theme.colors.foreground,
  },
}));
