import type { DetailItem } from "@/components/item-detail";
import { analytics } from "@/lib/analytics";
import { openPaywall, useEntitlement } from "@/lib/entitlement";
import { t, useAppLocale } from "@/lib/i18n";
import { createNoteSaveQueue, type NoteEdit } from "@/lib/note-edit";
import { api } from "@convex/_generated/api";
import {
  MAX_ITEM_TITLE_CHARS,
  MAX_NOTE_TEXT_CHARS,
} from "@convex/model/itemFields";
import { saveErrorCode } from "@convex/model/saveErrors";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** Idle time after the last keystroke before the note saves. */
const SAVE_DELAY_MS = 800;
const PAYWALL_PLACEMENT = "item_detail";

type LocalNoteEdits = {
  title?: { value: string; saved: boolean };
  text?: { value: string; saved: boolean };
};

/**
 * A note's title and text, edited in place and saved as the owner types. The
 * title field holds only a title the owner typed; the classifier's title shows
 * as its placeholder until they type their own.
 *
 * Mount one per note (keyed by id). Untouched fields follow server updates;
 * local edits stay visible until the server acknowledges the same value.
 */
export function NoteEditor({ item }: { item: DetailItem }) {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const { entitled } = useEntitlement();
  const updateNote = useMutation(api.items.updateNoteItem);
  const title = item.titleSource === "user" ? (item.title ?? "") : "";
  const text = item.note ?? "";
  const [state, setState] = useState<{
    title: string;
    text: string;
    edits: LocalNoteEdits;
  }>(() => ({ title, text, edits: {} }));
  if (state.title !== title || state.text !== text) {
    const edits = { ...state.edits };
    if (
      state.title !== title &&
      (edits.title?.saved || edits.title?.value.trim() === title)
    )
      delete edits.title;
    if (
      state.text !== text &&
      (edits.text?.saved || edits.text?.value === text)
    )
      delete edits.text;
    setState({ title, text, edits });
  }
  const draft = {
    title: state.edits.title?.value ?? title,
    text: state.edits.text?.value ?? text,
  };
  const textInput = useRef<TextInput>(null);
  const [queue] = useState(() => {
    // The component is keyed by note id: one queue and edit event per visit.
    let reportedEdit = false;
    let alerted = false;
    return createNoteSaveQueue(
      async (edit) => {
        await updateNote({ id: item._id, ...edit });
        setState((current) => {
          const edits = { ...current.edits };
          if (
            edit.title !== undefined &&
            edits.title?.value.trim() === edit.title
          )
            edits.title = { value: edit.title, saved: true };
          if (edit.text !== undefined && edits.text?.value === edit.text)
            edits.text = { value: edit.text, saved: true };
          return { ...current, edits };
        });
        alerted = false;
        if (!reportedEdit) {
          reportedEdit = true;
          analytics.itemAction(item, "note_edited");
        }
      },
      async (error) => {
        analytics.captureError("note_update_failed", error);
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
  const change = (edit: NoteEdit) => {
    queue.change(edit);
    setState((current) => ({
      ...current,
      edits: {
        ...current.edits,
        ...(edit.title !== undefined
          ? { title: { value: edit.title, saved: false } }
          : {}),
        ...(edit.text !== undefined
          ? { text: { value: edit.text, saved: false } }
          : {}),
      },
    }));
  };

  useEffect(() => {
    const timer = setTimeout(() => void queue.flush(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [queue, state.edits]);

  useEffect(() => {
    if (entitled) void queue.flush();
  }, [entitled, queue]);

  // Leaving the page, or swiping to another save, keeps what was typed.
  useEffect(() => () => void queue.flush(), [queue]);

  return (
    <View style={styles.editor}>
      <TextInput
        value={draft.title}
        onChangeText={(title) => change({ title })}
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
        onChangeText={(text) => change({ text })}
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
