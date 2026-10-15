# Create a space

Name a new themed collection. Creating one schedules a recommendation pass
that proposes existing saves as `suggested` members.

## Sub-features

- Spaces tab > New space opens a form with a name field and "Create space".
- The new space shows in the Spaces list.
- Suggested saves arrive later, for the user to accept or dismiss.

## How to get to it (user POV)

The `Spaces` tab, then `New space`. Needs Pro (seeded); without it, Create
space opens the paywall.

## Driving it with e2e

`tests/create-space.e2e.ts`, no model: `screen.getByRole("tab", "Spaces")`,
`screen.getByRole("button", "New space")`, `screen.getByRole("textbox")`,
`screen.getByLabel("Create space")` (a label without a button role), then
`screen.getByRole("button", <name>)` in the list.

## Proof

A button named after the new space (`Pilot <timestamp>`) shows in the Spaces
list. The space is a `spaces` row on the dev deployment. The suggestions pass
is not checked.

## Charters

```
space-flow|ios|skeptic|From the seeded Home, create a space on the Spaces tab, open it, and wait for suggestions; accept one and dismiss one, then check the space's saves
space-input|ios|fuzzer|From the seeded Home, create spaces named empty, with only spaces, with an emoji, with 200 characters, and with the same name as a seeded space; report what is accepted
```

## Gotchas

- "New space" has been tapped with its name field never appearing, once in
  nine runs before #351 and once after, cause unknown. The test now taps it
  through `tapUntilVisible`, so a lost tap shows as a second `New space` tap
  in the report instead of a failure.
