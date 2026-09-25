# Native design system

`apps/native/src/unistyles.ts` is the single source for type, spacing, color,
and control tokens; `apps/native/src/lib/motion.ts` is the motion vocabulary;
`src/components/ui/themed-text.tsx` and `src/components/ui/button.tsx` are the
primitives that consume them. New UI reaches for these names instead of
literals. Existing layouts keep their literal styles — migrate them when a
file is touched for other reasons, not in bulk.

## Type

The type ramp is `theme.type`: 23 named steps from `hero` (48) down to `badge`
(10), each pairing a font family with a size. The steps were not invented —
each one names a family/size pair the app already renders as a literal, so the
ramp is a census of the type in use rather than a wish list. Read it that way
before pruning it: a step no component passes to `variant` yet still describes
sizes written by hand across `src/`, and deleting it only means re-deriving it
from those literals later. The display face (`CrimsonProRoman-Regular`) carries titles
(`hero`, `largeTitle`, `sheetTitle`, `title`, `header`, `displaySmall`);
Satoshi regular/medium/bold carries body and label steps. `ThemedText` takes a
`variant` prop keyed by ramp name, defaults its color to
`theme.colors.foreground`, and applies `style` last so callers can override.
Use variants in new UI; a `fontSize` literal in a new component is a smell.
The census is not complete — bold 14, regular 12, medium 11, bold 11, and bold
26 are rendered as literals with no step yet — so migrating a file may mean
naming the step it needs instead of overriding sizes at the call site.

## Spacing, radius, and controls

Spacing is one scale: `theme.gap(n)`, n × 8, fractions included, so `gap(0.5)`
is 4, `gap(1.5)` is 12, and `gap(2.5)` is 20. New styles always read it and most
layouts already do, but adoption is no more exhaustive than the type ramp's: a
couple of dozen literal paddings remain in older files, a few of them off the
grid entirely (`intent-chip` pads 7 and 12), and they migrate when the file is
touched for other reasons. A parallel set of named steps was tried and removed:
it could express nothing `gap` could not, and it left two vocabularies for one
concept — reach for a fraction rather than a name. `theme.radius` is `sm` 8,
`md` 11, `lg` 16, and `xl` 24. `theme.control` holds the minimum touch target
height (48) and `pressRetentionOffset` (12); `Button` consumes both, so
interactive rows that roll their own `Pressable` should match them.
`theme.opacity` carries the pressed (0.7) and disabled (0.4) states so feedback
stays consistent.

## Color

Components never hardcode hex values; they read `theme.colors.*` roles. Roles
are semantic, not palette names: `background`, `surface`, `surfaceMuted`,
`foreground`, `muted`, `faint`, `primary`, `primaryForeground`, `primarySoft`,
`primaryText`, `border`, `imageBorder`, `danger`, `overlay`, `onOverlay`,
`onTint`, `keep`, `onKeep`, and `tabTint`. Content drawn on a filled tint
uses the paired `on*` role: `onTint` on `primary` (a dark label — white on
the amber fill is 2.19:1), `onKeep` on `keep`, `onOverlay` on `overlay`.
`tabTint` is the tab bar tint. iOS `NativeTabs` paints the selected tab's icon
and its label with it, so it carries normal-size text: the light theme darkens
it to 5.03:1 on `surfaceMuted`, the darkest surface the bar sits over. The
light theme's text colors are deliberately darkened to clear WCAG AA (`muted`
4.92:1 on `surfaceMuted`, the darkest surface it renders on; `faint` uses the
same accessible color for small captions; `primaryText` and `danger` just over
4.5:1 — the rationale sits in comments next to each value). Any new light-theme
text color must clear 4.5:1 for body text or 3:1 for large text against every
surface it renders on — including `surfaceMuted` and `primarySoft`, not the
paper background alone; check the dark themes for legibility too.

## Themes and appearance

Three themes ship: `light` (warm paper), `dark` (warm brown), and
`darkNeutral` (neutral gray surfaces with a high-contrast yellow accent, for
users who find the warm dark palette hard to focus on). Every color role must
exist in all three; a role added to one theme and not the others fails
typecheck. The user's appearance choice persists and is read at module scope,
so cold launch paints the pinned theme immediately; a pinned mode disables
adaptive theming so an OS scheme change cannot override the choice, while
`system` mode keeps `adaptiveThemes: true`. Breakpoints (`xs`–`xl`) are
declared in the same file for `useBreakpoints`.

## Motion

`lib/motion.ts` is a shared vocabulary, not a set of per-screen constants.
Durations form a budget — `feedback` 120ms for press/hover swaps, `state` 180
for in-place content changes, `enter` 250 / `exit` 200 for layout animations —
and the curves (`out`, `inOut`) match Expo's easing exactly, with `out`
published in CSS form too, so Reanimated timing and gesture-captured CSS
transitions feel identical (`motionCSS` exists because CSS easing objects
must stay outside `motion` or gesture capturing a spring tries to serialize
them to the UI runtime). Reach for `motion.timing.*` in `withTiming` calls
(timing objects carry an easing, so springs cannot take them),
`motion.spring.*` for gesture settles and drags, and
`motion.scale.pressed` for press feedback. The prebuilt timing objects cover
`feedback`, `enter`, and `fade`; a call site wanting another point in the
budget composes it from `motion.duration.*` and `motion.easing.*` instead of
a preset added ahead of its first use. The `fadeIn`/`fadeOut` builders
animate opacity only and stay gentle under Reduce Motion; never attach them
(or any `entering`) to recycled list rows — rows recycle constantly, so every
bind would replay an entrance. `REDUCED_FADE_*` covers reduced-motion state
swaps. The header text morph (`motion.textMorph`) is a deliberate signature
effect with its own budget, bounded scenes, and interruption handling; see
`components/animated-text.tsx` and `lib/text-morph.ts` before touching it.
Both scenes are glyph-bounded in `lib/text-morph.ts`: `MAX_MORPH_GLYPHS` caps
the laid-out title (replacing any tail with "…") and the retiring exit layer,
whichever a long note or rapid paging would otherwise blow past. Skia resolves
a font asynchronously and caches nothing, so a slot holds blank for one screen
transition rather than painting native text it would then have to animate away:
`resolveMorphRender` staggers a first scene in only while nothing has been
painted, and once native text has shown, every later canvas mount is opaque.
`FONT_HOLD_MS` is budgeted from measurement rather than taste. Timed from mount
to resolve on an iOS simulator over Metro's fetch, the font arrives in 53ms for
a session's first slot and 30ms warm, so the budget has room; the figure is a
simulator one, and a real device or Android still pays a typeface parse a
bundled read does not remove. The title's first ink lands later than the font
by roughly `morph.enterDelay`, so a recording's blank band is not the font
latency and must not be read as one. When the hold does lose, the canvas
replaces native text with a 2pt baseline step and no entrance, which is the
graceful outcome the latch exists to produce; that step is a real misalignment
between the canvas baseline and where iOS puts a native title, not an artifact
of the swap. `tools/measure-header-morph.mjs` crops the title band out of a
screen recording and re-checks the contract (no double paint, left-to-right
stagger, ramp budget, monotonic ink, bounded blank hold, no post-settle
baseline shift), with a swap mode that reports the native-to-canvas step; run
it before moving the hold or the morph timings. The ink measure follows the
recording's own theme, detected from the blank band that opens the window, and
frames are timed by their presentation timestamps: a recording whose spacing
leaves its nominal rate exits INCONCLUSIVE rather than being timed by index.

Reduce Motion is `System` by default on the timing objects except the `fade`
token and the fade builders, which use `Never`. Screens add explicit branches
where spatial motion would carry meaning: navigation stacks
fade instead of sliding, zoom transitions are suppressed, the tidy card
container drops its transforms, and the text morph falls back to native text
(alongside Dynamic Type above 1x and complex scripts, which native text
shapes correctly and per-glyph Skia cannot). Pure opacity changes may opt
into `ReduceMotion.Never` to keep state changes legible.

## Primitives

`Button` is the primary action component: it exposes `accessibilityRole`,
`accessibilityLabel`, and `accessibilityState` (disabled/busy), keeps its
label rendered while loading beside the spinner, consumes the control and
opacity tokens, and scales/opacity-shifts on press with a Reduce Motion
branch. `ThemedText` maps the type ramp. Prefer both over raw `Pressable`/
`Text` in new UI; raw components are for cases the primitives genuinely
cannot express.

## Adding tokens

Shared tokens go in `shared` (every theme inherits them); values that differ
per theme go in each theme's `colors`. Keep the `as const` annotations — the
generated types flow through the `UnistylesThemes` module augmentation into
`StyleSheet.create` factories and `useUnistyles`. Knip fails the build on
unused exports, so a new exported token or builder needs a consumer in the
same change. It cannot see properties inside the theme or `motion` objects, so
those are pruned by hand, and the bar differs by kind. A motion or radius token
is a tuned number: an unused preset reads to the next person as a measured
choice when nobody has ever watched it run, so add one when a call site needs
it, not before. The type ramp is the opposite case — its steps document sizes
the app already renders, so they stay whether or not a `variant` caller exists
yet.
