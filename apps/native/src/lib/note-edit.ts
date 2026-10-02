type NoteDraft = { title: string; text: string };
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

/** Saves one value, latest wins: a value typed while a write is in flight
 * replaces it in the queue, and a failed value is kept for the next flush
 * unless something newer was typed. Unlike a note's text, blank is a value
 * here; it clears the field. */
export function createLatestSaveQueue(
  write: (value: string) => Promise<void>,
  onError: (error: unknown) => Promise<void>,
) {
  let pending: string | null = null;
  let running: Promise<void> | null = null;

  async function drain() {
    while (pending !== null) {
      const value = pending;
      pending = null;
      try {
        await write(value);
      } catch (error) {
        pending ??= value;
        await onError(error);
        return;
      }
    }
  }

  return {
    change(value: string) {
      pending = value;
    },
    flush() {
      running ??= drain().finally(() => {
        running = null;
      });
      return running;
    },
  };
}
