# Save a note

Write a plain-text note from Home; the backend titles and tags it, and the
note is searchable by its own words.

## Sub-features

- Add > Note opens a composer with one text field and Save.
- Save closes the sheet; the note appears on Home as processing, then ready.
- The note's words are indexed, so Search finds it.
- Opening the note shows its text in an editable `Note text` field.

## How to get to it (user POV)

Home, the `Add` button in the header, then the Note option. Needs Pro, which
the seeded dev user has.

## Driving it with e2e

`tests/save-note.e2e.ts` pins it with no model. Locators:
`screen.getByTestId("add-option-note")` (through `chooseAddOption`),
`screen.getByTestId("add-note-input")`, `screen.getByRole("button", "Save")`,
`screen.getByRole("tab", "Search")`,
`screen.getByRole("textbox", "Search your saves")`,
`screen.getByRole("textbox", "Note text")`.

## Proof

The search for a word only the new note holds (`quokka`) returns exactly one
result, and opening it shows `Note text` with the note's full text. That
round trip is the side effect read back: the note is a row in `items` on the
dev deployment, ready and indexed.

## Charters

```
note-flow|ios|skeptic|From the seeded Home, save a note through Add > Note, then find it in Search and open it; check the text, the title, and that Home lists it once
note-input|ios|fuzzer|From the seeded Home, save notes that are empty, one emoji, 5000 characters, and a pasted URL through Add > Note; report what is accepted, rejected, or changed
```

## Gotchas

- The model writes the title, so the result's label is unknown; the test
  finds it as the only non-keyboard button on the Search screen.
- The tab bar stays in the tree under the closing Add sheet. A tap sent the
  moment the composer disappears lands on the sheet; wait for the input to be
  hidden plus `SHEET_TRANSITION_MS`.
