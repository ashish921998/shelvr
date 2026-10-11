# Mounted census (React fiber walk over the Argent debugger)

Method: walk `__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots(1)` (the React Native
renderer, React 19.2.3) and count fibers by component name; count
`getFiberRoots(2)` (the Skia reconciler, where every `<Canvas>` is its own root).

## At rest, deck just loaded (0 / 24)

| Component | Mounted |
| --- | ---: |
| TidyDeckComponent | 1 |
| CardAnimationProvider (one per card) | 24 |
| TidyHints (hint overlay) | 24 |
| Tint (3 per overlay) | 72 |
| Badge (3 per overlay) | 72 |
| Canvas / SkiaPictureView (1 per badge) | 72 |
| Skia renderer roots | 72 (144 Skia fibers: 72 Path + 72 skPath) |
| Total React Native fibers on the root | 5,691 |

## After five Keep swipes and one Undo (4 / 24)

| Component | Mounted |
| --- | ---: |
| CardAnimationProvider | 24 |
| TidyHints | 24 |
| Tint | 72 |
| Badge | 72 |
| Canvas | 72 |
| Skia renderer roots | 72 |

Reading: on this commit the image is windowed (`MOUNT_WINDOW` in `tidy-card.tsx`), but
the hint overlay (`<Animated.View style={[styles.hints, rHintsStyle]}><TidyHints /></Animated.View>`)
is rendered unconditionally by every card, so all 24 overlays and all 72 badge canvases
stay mounted for the whole batch, including cards already swiped away.

## Who re-renders on a gesture (updater attribution from the DevTools backend)

- Every drag start and release produced commits whose updaters were the
  `Animated.View` hint wrapper in all 24 `TidyCardComponent`s (24 updaters) and the
  `Animated.View` in all 24 `TidyCardContainerComponent`s (24 updaters), plus the
  top card's own `Tint` / `Badge` Animated.Views (1 to 3 each). These commits were small
  (0.4 to 6.7 ms in dev) because the components bail out quickly, but they are 48+
  component updates per gesture phase.
- Each Keep also flipped the image mount window on two cards. Those two
  `TidyCardComponent`s re-render, and because `TidyHints` is not memoized, each one
  re-renders its full hint subtree: 2 x (3 Tint + 3 Badge + 3 Canvas + 6 icons + 3 Text).
  Those were the only commits at or above 16 ms in dev (see the per-scenario tables).
