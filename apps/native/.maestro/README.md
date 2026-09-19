# Maestro flows

End-to-end flows that run against a built app on a simulator or emulator.
They exist because the unit suite cannot see the screens: the redesign's ink is
a Skia canvas, the component tests mock it away, and CI is static only
(`.github/workflows/ci.yml` runs lint, typecheck, tests, coverage, Knip,
Syncpack and audit — no device).

## What is here

| Flow                         | Covers                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shelf-redesign.yaml`        | Home, the Shelves tab, a shelf page, Search, Tidy, Map, the Add sheet, settings, an item page, the new-shelf sheet, Import and the camera fallback — plus the nav across all five tabs |
| `helpers/sign-in.yaml`       | Development anonymous sign-in, skipped when already signed in                                                                                                                          |
| `helpers/seed-fixtures.yaml` | Resets the account to the deterministic fixture library                                                                                                                                |

Helpers are subflows. They are pulled in with `runFlow` and are not meant to be
run on their own.

## Requirements

These flows drive a **development build** (`app.shelvr.save.dev`). That is not
incidental — anonymous sign-in and the fixture reset are both development-only
by design, so the flows cannot run against a production build:

- a development build installed on a simulator or emulator
- `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS=true` in `apps/native/.env.local`
- `AUTH_ENABLE_ANONYMOUS="true"` on the Convex deployment the build points at
- an English-locale device (a few assertions read visible copy)

## Running

```sh
# once
brew install maestro

# build and install a dev client on a booted simulator
cd apps/native
pnpm exec expo run:ios --configuration Debug

# then
maestro test .maestro/shelf-redesign.yaml
```

Screenshots land in the working directory under `redesign/`. They are the point
as much as the assertions are — see below.

## What these flows do and do not prove

They assert **structure and data**: that each screen mounts, that the nav
routes to all five tabs, that the seeded saves appear on the right shelves, and
that a shelf page and an item page open.

They cannot assert **appearance**. The drawn layer is
`accessibilityElementsHidden` / `importantForAccessibility="no"` by design, so
Maestro cannot see a hairline, a shelf, a type mark or the tab-change redraw. A
flow would pass with every canvas blank.

That is what `takeScreenshot` is for. The screenshots are a record for a human
to look at, not a comparison — there is no baseline and nothing diffs them. If
the ink layer is ever worth locking down automatically, the options are Skia's
own headless renderer (`makeOffscreenSurface` / `drawOffscreen`, which needs its
Jest wiring ported to this repo's Vitest setup) or a screenshot service such as
Sherlo or Chromatic.

## Selectors

Prefer `testID` over visible copy: the app ships nine locales and copy changes
without warning. Seeded rows carry stable ids built from their `fixtureKey`:

- `fixture-item-<key>` — a save standing on a shelf
- `fixture-item-detail-<key>` — its item page
- `fixture-space-<key>` — a shelf row on the Shelves tab
- `fixture-space-detail-<key>` — its shelf page

The keys are defined in `convex/devFixtures.ts`: saves `ramen`, `belem-tower`,
`apartment-checklist`, `value-of-craft`; shelves `recipes`, `trips`,
`apartment-shopping`.

Structural ids that are not fixture-derived: `tab-home`, `tab-spaces`,
`tab-tidy`, `tab-map`, `tab-search`, `shelf-new`, `shelf-earlier`,
`shelf-items`, `suggested-row`, `search-field`.
