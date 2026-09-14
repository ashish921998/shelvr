import type { DetailItem } from "@/components/item-detail";
import { analytics } from "@/lib/analytics";
import { openPaywall } from "@/lib/entitlement";
import { t, useAppLocale } from "@/lib/i18n";
import { pendingNoteEdit, type NoteDraft } from "@/lib/note-edit";
import { api } from "@convex/_generated/api";
import {
  MAX_ITEM_TITLE_CHARS,
  MAX_NOTE_TEXT_CHARS,
} from "@convex/model/itemFields";
import { saveErrorCode } from "@convex/model/saveErrors";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** Idle time after the last keystroke before the note saves. */
const SAVE_DELAY_MS = 800;
const PAYWALL_PLACEMENT = "item_detail";

/**
 * A note's title and text, edited in place and saved as the owner types. The
 * title field holds only a title the owner typed; the classifier's title shows
 * as its placeholder until they type their own.
 *
 * Mount one per note (keyed by id). The fields are seeded once, so a server
 * push of the same note never overwrites text mid-edit; the classifier's
 * refresh only changes fields this editor does not own.
 */
export function NoteEditor({ item }: { item: DetailItem }) {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const updateNote = useMutation(api.items.updateNoteItem);
  const [draft, setDraft] = useState<NoteDraft>(() => ({
    title: item.titleSource === "user" ? (item.title ?? "") : "",
    text: item.note ?? "",
  }));
  const saved = useRef(draft);
  const latest = useRef(draft);
  const textInput = useRef<TextInput>(null);
  // One edit event per visit, and one alert per run of failed saves.
  const reportedEdit = useRef(false);
  const alerted = useRef(false);

  const save = useEffectEvent(async (next: NoteDraft) => {
    const edit = pendingNoteEdit(next, saved.current);
    if (edit === null) return;
    const previous = saved.current;
    saved.current = edit;
    try {
      await updateNote({ id: item._id, title: edit.title, text: edit.text });
      alerted.current = false;
      if (!reportedEdit.current) {
        reportedEdit.current = true;
        analytics.itemAction(item, "note_edited");
      }
    } catch (error) {
      // Unsaved: the next pause in typing, or leaving the page, tries again.
      saved.current = previous;
      if (saveErrorCode(error) === "pro_required") {
        await openPaywall(router, PAYWALL_PLACEMENT);
        return;
      }
      if (!alerted.current) {
        alerted.current = true;
        Alert.alert(t("errors.saveTitle"), t("errors.tryAgain"));
      }
    }
  });

  useEffect(() => {
    latest.current = draft;
    const timer = setTimeout(() => void save(draft), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  // Leaving the page, or swiping to another save, keeps what was typed.
  useEffect(() => () => void save(latest.current), []);

  return (
    <View style={styles.editor}>
      <TextInput
        value={draft.title}
        onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
        placeholder={
          item.titleSource !== "user" && item.title
            ? item.title
            : t("item.noteTitlePlaceholder")
        }
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel={t("item.noteTitleLabel")}
        maxLength={MAX_ITEM_TITLE_CHARS}
        multiline
        scrollEnabled={false}
        submitBehavior="submit"
        returnKeyType="next"
        onSubmitEditing={() => textInput.current?.focus()}
        style={styles.title}
      />
      <TextInput
        ref={textInput}
        value={draft.text}
        onChangeText={(text) => setDraft((current) => ({ ...current, text }))}
        maxLength={MAX_NOTE_TEXT_CHARS}
        placeholder={t("capture.notePlaceholder")}
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel={t("item.noteTextLabel")}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        style={styles.text}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  editor: {
    gap: theme.gap(1.5),
  },
  title: {
    padding: 0,
    fontFamily: theme.fonts.bold,
    fontSize: 24,
    lineHeight: 30,
    color: theme.colors.foreground,
  },
  text: {
    padding: 0,
    minHeight: 160,
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    lineHeight: 25,
    color: theme.colors.foreground,
  },
}));
