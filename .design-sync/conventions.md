# Building with Shelvr components

These are Shelvr's React Native app components, compiled for the web through
react-native-web and exposed on `window.ShelvrUI`. They render the app's non-iOS
look: Material Symbols icons, a translucent circle instead of liquid glass, and no
haptics.

## Setup

No provider or wrapper. Loading the bundle registers Shelvr's themes and writes the
theme CSS variables onto `:root`, so they resolve before any component mounts. The
palette follows the viewer's colour scheme: light by default, warm dark under
`prefers-color-scheme: dark`.

## Styling

Components style themselves. There are no CSS classes to apply. Props follow React
Native, not the DOM: `onPress`, not `onClick`; `style` takes a React Native style
object. For your own layout glue, use plain elements with the theme variables:

| Group           | Variables                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces        | `--colors-background` (screen), `--colors-surface` (cards), `--colors-surface-muted`                                                        |
| Text            | `--colors-foreground`, `--colors-muted`, `--colors-faint`                                                                                   |
| Accent          | `--colors-primary` (buttons), `--colors-primary-foreground` (text on primary), `--colors-primary-soft` (chip fill), `--colors-primary-text` |
| Lines and state | `--colors-border`, `--colors-image-border`, `--colors-danger`, `--colors-overlay`                                                           |
| Type            | `--fonts-regular`, `--fonts-medium`, `--fonts-bold` (Satoshi), `--fonts-display` (Crimson Pro, for titles and the wordmark)                 |

Spacing and radii are not variables. Use the app's literal values: spacing steps of
8px (4, 8, 12, 16, 24, 32), radii 8 (images), 11 (cards and settings rows), 16
(inline cards), 24 (sheets), and a full capsule for `Button` and pills. `Button` and
settings rows are at least 48px tall; `HeaderIconButton` is a 40px circle.

## Type and actions

- Set text with `ThemedText` and a `variant` from the type ramp, not a `font-size`.
  Titles use the Crimson Pro steps (`hero`, `largeTitle`, `sheetTitle`, `title`,
  `header`, `displaySmall`); everything else is Satoshi (`body`, `subhead`,
  `caption`, `label`, and their `Label` / `Strong` weights). It defaults to
  `--colors-foreground`; pass `style={{ color: "var(--colors-muted)" }}` for
  secondary copy.
- `Button` is the one main action on a screen: an amber capsule with a dark label.
  It stretches to its parent's width. Use `loading` while its action runs; the label
  stays put. Do not use it for settings or secondary actions.
- Settings use `SettingCard` (a title, a description, and either an inline control
  as `accessory` or a text `action`) and `SettingsGroup` with `SettingsRow` children
  (a label, an optional `value`, a trailing icon). Pass `divider={false}` to the
  first row in a group.

## Composition rules

- `EmptyState` and `ScreenLoader` fill their parent (`flex: 1`). Give them a
  `display: flex; flex-direction: column` parent with a real height.
- `InlineCard` brings its own 16px side margin and card frame; pass the actions as
  children.
- Icons take one of the names in `AppSymbolIconProps['name']`. `HeaderIconButton.icon`
  takes the same names. `tintColor` accepts `var(--colors-*)` strings.
- Tags are short lowercase words. `IntentChip` covers eight `kind`s, each with a fixed icon.

## Where the truth lives

Read `components/general/<Name>/<Name>.d.ts` for each component's props and
`<Name>.prompt.md` for its usage examples before composing.

## Example

```jsx
const { HeaderIconButton, Wordmark, EmptyState, Button } = window.ShelvrUI;

<div
  style={{
    display: "flex",
    flexDirection: "column",
    height: 844,
    background: "var(--colors-background)",
  }}
>
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
    }}
  >
    <HeaderIconButton icon="person.fill" label="Profile" onPress={() => {}} />
    <Wordmark />
    <HeaderIconButton icon="plus" label="Add save" onPress={() => {}} />
  </div>
  <EmptyState
    title="Save it for later"
    message={
      "Tap + to drop in a link, a photo, or a stray thought.\nShelvr keeps it warm until you need it."
    }
  />
  <div style={{ padding: 16 }}>
    <Button title="Add a save" onPress={() => {}} />
  </div>
</div>;
```
