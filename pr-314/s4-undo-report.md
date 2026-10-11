# Profiling Analysis — 13.6s session
**React Compiler:** ✗  **Hot commits:** 1 of 13 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #2 — 12.32ms 🔵 (t=5.9s, margin)
> After: "tap Undo (header, top left)" (0.5s prior)

- `View` ×65 — 2.86ms self, 129.86ms w/children — parent re-render
- `Badge` ×3 — 2.11ms self, 6.73ms w/children — parent re-render
- `AnimatedComponent(View)` ×17 — 1.63ms self, 32.32ms w/children — props: style
- `TidyHints` — 1.56ms self, 9.92ms w/children — parent re-render
- `TidyCardComponent` [React.memo] — 0.63ms self, 12.32ms w/children — hooks
- `Canvas` ×3 — 0.51ms self, 0.54ms w/children — props: children
- `Tint` ×3 — 0.42ms self, 1.34ms w/children — parent re-render
- `AppSymbolIcon` ×6 — 0.36ms self, 0.93ms w/children — parent re-render
- `Text` ×8 — 0.31ms self, 0.92ms w/children — parent re-render
- `SymbolView` ×6 — 0.28ms self, 0.57ms w/children — parent re-render
- `SymbolModule` ×6 — 0.23ms self, 0.29ms w/children — props: style, colors
- `TidyCardContainerComponent` [React.memo] — 0.18ms self, 11.69ms w/children — props: children
- `Image` — 0.17ms self, 0.52ms w/children — (mount)
- `ExpoImage` ×2 — 0.12ms self, 0.66ms w/children — (mount)

### Commit #3 — 24.36ms 🟡 (t=6.0s)
> After: "tap Undo (header, top left)" (0.6s prior)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `View` re-rendered — props: style, ref

Render cascade:
- `TidyHints` — 7.53ms self, 22.99ms w/children — parent re-render
- `View` ×63 — 5.26ms self, 288.76ms w/children — props: style, ref
- `SymbolView` ×6 — 3.64ms self, 4.11ms w/children — parent re-render
- `Badge` ×3 — 2.3ms self, 13.92ms w/children — parent re-render
- `AnimatedComponent(View)` ×17 — 2.12ms self, 73.8ms w/children — props: style
- `Tint` ×3 — 0.56ms self, 1.19ms w/children — parent re-render
- `Text` ×6 — 0.43ms self, 0.79ms w/children — props: ref
- `AppSymbolIcon` ×6 — 0.38ms self, 4.5ms w/children — parent re-render
- `TidyCardContainerComponent` [React.memo] — 0.37ms self, 24.15ms w/children — props: children
- `SymbolModule` ×6 — 0.34ms self, 0.48ms w/children — props: style, colors
- `Canvas` ×3 — 0.26ms self, 0.3ms w/children — props: children
- `TidyCardComponent` [React.memo] — 0.22ms self, 24.36ms w/children — hooks

**CPU during this commit:**
- `[Host Function] getLocales` self=10.07ms total=10.07ms ([host]:0)
- `[Host Function] run` self=8.16ms total=8.16ms ([host]:0)
- `commitMutationEffectsOnFiber` self=6.13ms total=6.13ms (&platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src/app&unstable_transformProfile=hermes-stable:25494)

### Commit #4 — 1.78ms 🔵 (t=7.2s, margin)
> After: "tap Undo (header, top left)" (1.8s prior)

- `AnimatedComponent(View)` ×26 — 5.62ms self, 15.34ms w/children — parent re-render
- `View` ×52 — 4.52ms self, 17.53ms w/children — props: style, transform, ref

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `View` | 178 | 12.6ms | 0.07ms | 1.31ms | props: style, children, ref | — |
| `Badge` | 6 | 4.4ms | 0.74ms | 1.33ms | parent re-render | `tidy/tidy-hints.tsx:78` |
| `SymbolView` | 12 | 3.9ms | 0.33ms | 3.34ms | parent re-render | — |
| `Tint` | 6 | 1ms | 0.16ms | 0.42ms | parent re-render | `tidy/tidy-hints.tsx:49` |
| `Canvas` | 6 | 0.8ms | 0.13ms | 0.36ms | props: children | — |
| `AppSymbolIcon` | 12 | 0.7ms | 0.06ms | 0.15ms | parent re-render | `components/symbol.tsx:104` |
| `Text` | 12 | 0.7ms | 0.06ms | 0.09ms | parent re-render | — |
| `SymbolModule` | 12 | 0.6ms | 0.05ms | 0.1ms | props: style, colors | — |

---
## Suggested Improvements

### `View`

**Stabilize props:** `style`, `children`, `ref`. Likely inline objects/functions at the callsite — extract to constants or wrap with `useMemo`/`useCallback`.

### `Badge` — `tidy/tidy-hints.tsx:78`

**Parent trigger:** `View` is re-rendering unnecessarily. Fix the root cause in the parent first; this component will stop re-rendering as a side effect.

<details><summary>Source — `tidy/tidy-hints.tsx:78`</summary>

```tsx

const Badge: FC<BadgeProps> = ({ direction, label, icon, accentColor }) => {
  const progress = useDirectionProgress(direction);

  const rBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // Small buffer so the fill flips as the arc looks visually complete.
  const buffer = STROKE_WIDTH / 2 / BADGE_SIZE;

  const rCircleStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(
      progress.get() + buffer > 1 ? "white" : "transparent",
      motion.timing.fade,
    ),
  }));

  const rAccentIconStyle = useAnimatedStyle(() => ({
    opacity: withTiming(
      progress.get() + buffer > 1 ? 1 : 0,
      motion.timing.fade,
    ),
  }));

  const arcPath = useDerivedValue(() => {
    const skPath = Skia.Path.Make();
    const sweepDegrees = Math.max(0, progress.get()) * 360;
    skPath.addArc(
      {
        x: STROKE_WIDTH / 2,
        y: STROKE_WIDTH / 2,
        width: BADGE_SIZE - STROKE_WIDTH,
        height: BADGE_SIZE - STROKE_WIDTH,
      },
      -90,
      sweepDegrees,
    );
    return skPath;
  });

  return (
    <Animated.View style={[styles.badge, rBadgeStyle]}>
      <Animated.View style={[styles.badgeCircle, rCircleStyle]}>
        <Canvas style={styles.badgeCanvas}>
          <Path
            path={arcPath}
            color="white"
            style="stroke"
            strokeWidth={STROKE_WIDTH}
```

</details>

### `SymbolView`

**Parent trigger:** `View` is re-rendering unnecessarily. Fix the root cause in the parent first; this component will stop re-rendering as a side effect.

### `Tint` — `tidy/tidy-hints.tsx:49`

**Parent trigger:** `View` is re-rendering unnecessarily. Fix the root cause in the parent first; this component will stop re-rendering as a side effect.

<details><summary>Source — `tidy/tidy-hints.tsx:49`</summary>

```tsx

const Tint: FC<{ direction: Direction; color: string }> = ({
  direction,
  color,
}) => {
  const progress = useDirectionProgress(direction);

  const rTintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.get(),
      [0, 1],
      [0, 0.55],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Animated.View
      style={[styles.tint, rTintStyle, { backgroundColor: color }]}
    />
  );
};

type BadgeProps = {
  direction: Direction;
  label: string;
  icon: AppSymbolName;
  accentColor: string;
};

const Badge: FC<BadgeProps> = ({ direction, label, icon, accentColor }) => {
  const progress = useDirectionProgress(direction);

  const rBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // Small buffer so the fill flips as the arc looks visually complete.
  const buffer = STROKE_WIDTH / 2 / BADGE_SIZE;

  const rCircleStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(
      progress.get() + buffer > 1 ? "white" : "transparent",
      motion.timing.fade,
    ),
  }));

  const rAccentIconStyle = useAnimatedStyle(() => ({
    opacity: withTiming(
      progress.get() + buffer > 1 ? 1 : 0,
```

</details>

### `Canvas`

**Stabilize props:** `children`. Likely inline objects/functions at the callsite — extract to constants or wrap with `useMemo`/`useCallback`.


> 📝 Dev mode renders are ~3× slower than production. Divide ms values by ~3 for a rough production estimate.

---
## Next Steps

Ask the user which path to take:

1. **Investigate further** — use query tools to drill into specific findings before making changes:
   - `profiler-commit-query` mode=`by_index` commit_index=3 — full breakdown of the slowest commit
   - `profiler-cpu-query` mode=`component_cpu` component_name=`View` — CPU activity during this component's renders
   - `profiler-cpu-query` mode=`call_tree` — trace callers/callees of hot functions
2. **Implement fixes** — apply changes to the top offenders identified above, then re-profile the same scenario to measure improvement.
3. **Done for now** — save the report for reference.