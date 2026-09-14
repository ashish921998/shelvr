// The note page saves as the owner types. This decides what, if anything, a
// save sends, so the editor only has to debounce.

export type NoteDraft = { title: string; text: string };

/** The edit to send for `draft`, or null when it matches what was last saved
 * or cannot be saved (a note needs text). Titles are compared and sent trimmed,
 * the way the server stores them. */
export function pendingNoteEdit(
  draft: NoteDraft,
  saved: NoteDraft,
): NoteDraft | null {
  if (draft.text.trim() === "") {
    return null;
  }
  const title = draft.title.trim();
  if (title === saved.title.trim() && draft.text === saved.text) {
    return null;
  }
  return { title, text: draft.text };
}
