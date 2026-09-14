import { describe, expect, it } from "vitest";

import { pendingNoteEdit } from "./note-edit";

const saved = { title: "Milk run", text: "Buy oat milk" };

describe("pendingNoteEdit", () => {
  it("sends nothing when the draft matches the saved note", () => {
    expect(pendingNoteEdit({ ...saved }, saved)).toBeNull();
  });

  it("ignores whitespace around the title", () => {
    expect(
      pendingNoteEdit({ title: "  Milk run ", text: saved.text }, saved),
    ).toBeNull();
  });

  it("sends changed text with the trimmed title", () => {
    expect(
      pendingNoteEdit(
        { title: " Milk run", text: "Buy oat milk and eggs" },
        saved,
      ),
    ).toEqual({ title: "Milk run", text: "Buy oat milk and eggs" });
  });

  it("sends a cleared title", () => {
    expect(pendingNoteEdit({ title: "", text: saved.text }, saved)).toEqual({
      title: "",
      text: saved.text,
    });
  });

  it("never sends a note without text", () => {
    expect(
      pendingNoteEdit({ title: "Milk run", text: "   " }, saved),
    ).toBeNull();
  });
});
