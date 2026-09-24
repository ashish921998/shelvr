# Design sync notes

Shelvr has no web component library. The synced components are the React Native
components in `apps/native/src/components`, compiled for the web through
react-native-web. They render their non-iOS branches: no liquid glass (translucent
fallback), Material Symbols instead of SF Symbols, no haptics.

## Decisions

- Scope (first sync, 2026-09-13): tokens and fonts plus reusable building blocks
  only. Whole screens (item detail, masonry feed, reader, onboarding) are out.
- The display face is `CrimsonProRoman-Regular.ttf`, licensed under SIL OFL 1.1.
  Re-sync fonts and components to update previously uploaded design previews.
- Synced components are listed in `.design-sync/web-entry.ts`: `AppSymbolIcon`,
  `EmptyState`, `HeaderIconButton`, `InlineCard`, `IntentChip`, `ScreenLoader`,
  `SuggestedBadge`, `TagChip`, `Wordmark`. All get authored previews.
- `ItemCard` is out (user decision). It needs Expo Router `Link.Trigger`/`Link.Menu`,
  three Convex mutations, `Alert`, `Share`, and haptics, and would crash in designs
  without a Convex provider. Revisit if a presentational card with plain props exists.
- `GlassView` is not synced (user decision).
- No Storybook exists (user confirmed); shape is `package`.
- `HeaderActionMenu` (same file as `HeaderIconButton`) is not synced: its menu is
  inert on web (`@expo/ui` `MenuView` renders the trigger only and warns once).

## Web build requirements (found in the feasibility spike)

- App source must go through `apps/native/babel.config.js` (babel-preset-expo with
  caller `platform: 'web'`). Its `react-native-unistyles/plugin` swaps primitives for
  unistyles components; without it every `StyleSheet.create` style is dropped and
  the `unistyles-web` stylesheet has 0 rules.
- The same Babel pass must cover `react-native-reanimated/lib/module/component/*.js`
  (the plugin's `REPLACE_WITH_UNISTYLES_PATHS`). Otherwise `Animated.View` containers
  lose their styles (seen on `EmptyState`).
- The plugin rewrites imports to `react-native-unistyles/components/native/<Name>`.
  The exports map targets extensionless files, so the bundler must map them to
  `lib/module/components/native/<Name>.js`.
- react-native-web gaps the app hits at module load:
  - `Appearance.setColorScheme` is missing; `src/unistyles.ts` calls it. Shimmed as a no-op.
  - `PlatformColor` is not exported; `expo-symbols` imports it (Android-only call).
  - `expo-font`'s web build imports `node:async_hooks` (server-only path). Stubbed.
  - A `process` global is expected (`react-native-worklets`, `semver`). Banner shim.
- Unistyles writes theme CSS variables into `<style id="unistyles-web">` only when the
  first style is applied (`recreate()` runs on `css.add`). A card or design that uses
  only `AppSymbolIcon` (no unistyles styles) got no `--colors-*`/`--fonts-*` at all.
  `web-entry.ts` calls `UnistylesRuntime.updateTheme('light', (theme) => theme)` after
  the theme import, which writes every theme's variables at load.
- react-native-web's `<style id="react-native-stylesheet">` in `<head>` matched the
  render check's `#root, [id^="r"]` root selector first; its `innerHTML` is empty
  (rules use `insertRule`), so every card failed `[RENDER] root empty` while rendering
  fine. `build-web.mjs` renames the id to `stylesheet-react-native`.
- `tintColor` accepts `var(--colors-*)` strings on web once the variables exist.
- `src/components/symbol.tsx` passes `{ android, web }` names. Before this fix every
  icon rendered blank on web, because `expo-symbols` reads the `web` key in browsers.
- react-native-mmkv works on web (the appearance store reads without error).

## Contracts and previews

- The converter collapses any type over 240 characters to `unknown` (`lib/dts.mjs`).
  `AppSymbolName` (53 names) is one, so `AppSymbolIcon.name` and `HeaderIconButton.icon`
  are hand-written in `config.json` `dtsPropsFor`. `build-web.mjs` fails when either
  union drifts from the keys of `SF_TO_MATERIAL` in `src/components/symbol.tsx`; when an
  icon is added or removed, update both unions.
- Previews cannot import `react-native` (it is not in the bundle). Layout glue is plain
  `div`s. Theme values are CSS variables unistyles registers on `:root`, named
  `--<group>-<kebab-key>`: `--colors-background`, `--colors-primary-foreground`,
  `--fonts-bold`.
- Preview copy comes from the app: EmptyState titles and messages from the tab screens,
  InlineCard from `feedback/feedback-invitation.tsx`, tags and intent labels from
  `convex/devFixtures.ts` (tags are short lowercase words, two per save).
- `EmptyState` fills its parent (`flex: 1`); its previews give it a 300px-tall frame.

## Known build and render warns

- `[direct-eval]` in `expo-modules-core/src/uuid/index.web.ts`: `eval("require")("node:crypto")`
  runs only when `window` is undefined. Never reached in a browser.
- `[CSS_RUNTIME]`: expected. Styles and theme variables are injected by unistyles at
  runtime; `styles.css` carries only the font faces.

## Re-sync risks

What can go stale without failing loudly:

- `build-web.mjs` patches exact strings in dependencies: `export default Appearance;`
  and `var defaultId = 'react-native-stylesheet';` in react-native-web. A version bump
  that changes either makes the `.replace` a silent no-op. Symptoms: every card fails
  `[RENDER] root empty` (stylesheet id), or the bundle throws
  `Appearance_default.setColorScheme is not a function` at load.
- The unistyles plugin's reanimated path (`lib/module/component`) and the
  `lib/module/components/native/<Name>.js` layout are unistyles 3.3.0 internals. If
  animated containers lose their styles again, check both after an upgrade.
- The theme flush depends on web `UnistylesRuntime.updateTheme` calling `recreate()`.
  If `AppSymbolIcon` previews lose their background and tints, re-probe
  `--colors-background` on its card.
- `dtsPropsFor` icon unions are guarded by `build-web.mjs`. The `NAMES` list in
  `previews/AppSymbolIcon.tsx` is not; update it when `SF_TO_MATERIAL` changes.
- Preview copy mirrors app strings that can change: EmptyState titles and messages
  (tab screens), feedback invitation and cancel survey copy, `CANCEL_REASON_LABELS`.
  The InlineCard preview re-expresses those screens' button styles as CSS.
- `TagChip`'s `emphasized` variant is previewed but unused by any screen.
- Only the light palette is visually graded. Dark values were checked as CSS variables
  under `prefers-color-scheme: dark`, not as rendered cards. `darkNeutral` is unchecked.

## Re-sync

From the repo root, after `pnpm install`:

1. Stage the converter: copy the design-sync skill's `package-build.mjs`,
   `package-validate.mjs`, `package-capture.mjs`, `resync.mjs`, `lib/`, and `storybook/`
   into `.ds-sync/`, then `npm i esbuild ts-morph @types/react playwright@1.62.0` there.
2. `node .design-sync/build-web.mjs` (the `buildCmd`). It fails if the icon unions drift.
3. Fetch `_ds_sync.json` from the project into `.design-sync/.cache/remote-sync.json`.
4. `node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json`

`--node-modules` is the repo root: react, react-dom, and @types/react are hoisted there.

## Environment

- Converter deps are staged in `.ds-sync/` with `npm`, separate from the pnpm workspace.
- Playwright 1.62.0 matches the cached `chromium-1234` in `~/Library/Caches/ms-playwright`.
