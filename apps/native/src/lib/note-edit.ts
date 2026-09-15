export type NoteDraft = { title: string; text: string };
export type NoteEdit = Partial<NoteDraft>;

/** Serializes edits and retains failed fields until another flush. A newer
 * field value always wins over the value in a failed request. */
export function createNoteSaveQueue(
  write: (edit: NoteEdit) => Promise<void>,
  onError: (error: unknown) => Promise<void>,
) {
  let pending: NoteEdit = {};
  let running: Promise<void> | null = null;
  let requested = false;

  async function drain() {
    while (requested) {
      requested = false;
      const edit = {
        ...pending,
        ...(pending.title !== undefined ? { title: pending.title.trim() } : {}),
      };
      if (edit.text?.trim() === "") delete edit.text;
      if (Object.keys(edit).length === 0) return;
      pending = pending.text?.trim() === "" ? { text: pending.text } : {};
      try {
        await write(edit);
      } catch (error) {
        pending = { ...edit, ...pending };
        await onError(error);
      }
    }
  }

  return {
    change(edit: NoteEdit) {
      pending = { ...pending, ...edit };
    },
    flush() {
      requested = true;
      running ??= drain().finally(() => {
        running = null;
      });
      return running;
    },
  };
}
