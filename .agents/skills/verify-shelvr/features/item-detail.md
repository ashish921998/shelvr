# Item detail

Tapping a save on Home opens its page. A note's page is its editor: the title
and text save as the owner types, and again when they leave the page.

## Sub-features

- A card on Home opens the save's page; the back button (test id
  `BackButton`) returns to Home.
- On a note, the "Note title" and "Note text" fields edit in place
  (`src/components/note-editor.tsx`): a save 800 ms after the last change,
  and one more when the page unmounts.
- Not covered yet: a link or photo page (source button, intents, recipe,
  similar saves), the More menu, and filing into a space from the page.

## How to get to it (user POV)

Home, tap a save's card. The seeded note is `fixture-item-apartment-checklist`
("Apartment Shopping Checklist", text "Lamp, shelves, linen, and a reading
chair.").

## Driving it with e2e

`tests/item-detail.e2e.ts`, no model: `tapUntilVisible` from the card to
`screen.getByRole("textbox", "Note text")`, `fillField` with a new text, tap
`getByTestId("BackButton")`, wait for the field to be hidden, then open the
card again and expect the new text.

## Proof

The reopened page shows the edited text, read back from the dev deployment.
With every save path in the editor disabled, the same test fails on that last
check, showing the seeded text.

## Charters

```
item-note-edit|ios|skeptic|From the seeded Home, open the apartment checklist note, edit its title and text, leave at once and after a pause, and check both survive a reopen and a relaunch
```

## Gotchas

- After Back, the old page stays in the accessibility tree for a moment.
  Reopening before its field is hidden reads the field just typed into and
  proves nothing; the test waits for `toBeHidden` first.
- The edit stays on the dev user until the next run's fixture reset.
