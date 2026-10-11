# Profiling Analysis — 47.3s session
**React Compiler:** ✗  **Hot commits:** 3 of 53 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #0 — 21.61ms 🟡 (t=6.3s)
> After: "Keep swipe 1 (right, 150 ms)" (0.8s prior)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `TidyDeckView` re-rendered — hooks: useContext, useCallback

Render cascade:
- `TidyDeckView` — 4.09ms self, 21.61ms w/children — hooks: useContext, useCallback
- `View` ×71 — 2.89ms self, 187.57ms w/children — props: children, ref
- `TidyHints` — 2.42ms self, 8.97ms w/children — parent re-render
- `AnimatedComponent(View)` ×17 — 2.28ms self, 31.71ms w/children — props: style
- `TidyCardComponent` [React.memo] — 1.27ms self, 14.77ms w/children — hooks
- `Badge` ×3 — 1.24ms self, 5.37ms w/children — parent re-render
- `Image` — 0.89ms self, 1.62ms w/children — (mount)
- `Text` ×10 — 0.75ms self, 2.64ms w/children — props: children, ref
- `Canvas` ×3 — 0.46ms self, 0.49ms w/children — props: children
- `TidyCardContainerComponent` [React.memo] — 0.44ms self, 13.5ms w/children — props: children
- `ExpoImage` ×2 — 0.37ms self, 1.31ms w/children — (mount)
- `StackToolbar` ×2 — 0.35ms self, 0.6ms w/children — props: children
- `Screen` — 0.32ms self, 0.32ms w/children — props: options
- `Tint` ×3 — 0.31ms self, 0.95ms w/children — parent re-render
- `AppSymbolIcon` ×6 — 0.29ms self, 0.81ms w/children — parent re-render
- _... and 4 more_
- _Shown: 18.4ms self / 21.61ms commit (85%) — 4 more components not shown. Use `profiler-commit-query mode=by_index commit_index=0` to see all._

**CPU during this commit:**
- `[Host Function] completeRoot` self=9.91ms total=9.91ms ([host]:0)
- `propagateParentContextChanges` self=8.47ms total=8.47ms (&platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src/app&unstable_transformProfile=hermes-stable:21599)
- `reconcileChildFibersImpl` self=3.23ms total=3.23ms (&platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src/app&unstable_transformProfile=hermes-stable:22331)

### Commit #1 — 7.83ms 🔵 (t=6.3s, margin)
> After: "Keep swipe 1 (right, 150 ms)" (0.8s prior)

- `NativeStackNavigator` — 3.44ms self, 7.83ms w/children — state: useState, useReducer
- `SceneView` ×2 — 1.04ms self, 3.36ms w/children — props: options, clearOptions
- `NativeStackView` — 0.36ms self, 3.9ms w/children — props: descriptors, describe
- `ScreenStackItem` [forwardRef] — 0.33ms self, 2.14ms w/children — props: sheetAllowedDetents, onWillAppear, onWillDisappear
- `Animated(Anonymous)` — 0.26ms self, 1.31ms w/children — props: sheetAllowedDetents, onHeaderHeightChange, onWillAppear
- `InnerScreen` [forwardRef] — 0.22ms self, 1.74ms w/children — props: sheetAllowedDetents, style, scrollEdgeEffects
- `NavigationProvider` ×2 — 0.22ms self, 2.68ms w/children — props: children
- `NavigationContent` — 0.19ms self, 4.33ms w/children — props: render, children
- `FrameSizeProvider` — 0.14ms self, 3.47ms w/children — props: render
- `Context.Provider` ×22 — 0.13ms self, 45.04ms w/children — (mount)
- `ScreenStackHeaderConfig` — 0.12ms self, 0.39ms w/children — props: children, headerLeftBarButtonItems, headerRightBarButtonItems
- `ScreenStack` — 0.12ms self, 3.25ms w/children — props: nativeContainerStyle, children
- `PreventRemoveProvider` — 0.12ms self, 4.05ms w/children — props: children
- `Anonymous` ×2 — 0.1ms self, 7.51ms w/children — props: children
- `Freeze` — 0.1ms self, 1.48ms w/children — props: children
- _... and 15 more_
- _Shown: 6.9ms self / 7.83ms commit (88%) — 15 more components not shown. Use `profiler-commit-query mode=by_index commit_index=1` to see all._

### Commit #4 — 1.28ms 🔵 (t=8.1s, margin)
> After: "Keep swipe 1 (right, 150 ms)" (2.6s prior)

- `View` ×100 — 4.53ms self, 18.47ms w/children — props: style, ref
- `AnimatedComponent(View)` ×50 — 3.72ms self, 14.29ms w/children — parent re-render

### Commit #5 — 43.47ms 🟡 (t=15.0s)
> After: "Keep swipe 2" (0.5s prior)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `View` re-rendered — props: children, ref

Render cascade:
- `TidyHints` ×2 — 8.68ms self, 27.93ms w/children — parent re-render
- `View` ×134 — 7.05ms self, 473.57ms w/children — props: children, ref
- `TidyDeckView` — 6.89ms self, 43.47ms w/children — hooks: useContext, useCallback
- `AnimatedComponent(View)` ×34 — 4.94ms self, 85.85ms w/children — props: style
- `Badge` ×6 — 3.69ms self, 15ms w/children — parent re-render
- `TidyCardComponent` [React.memo] ×2 — 1.19ms self, 32.85ms w/children — hooks
- `Canvas` ×6 — 1.16ms self, 1.27ms w/children — props: children
- `Text` ×16 — 0.76ms self, 6.55ms w/children — props: children, ref
- `Tint` ×6 — 0.65ms self, 3.64ms w/children — parent re-render
- `SymbolView` ×12 — 0.59ms self, 1.32ms w/children — parent re-render
- `AppSymbolIcon` ×12 — 0.58ms self, 1.89ms w/children — parent re-render
- `SymbolModule` ×12 — 0.54ms self, 0.72ms w/children — props: style, colors
- `StackScreen` — 0.31ms self, 0.57ms w/children — props: options
- `Screen` — 0.26ms self, 0.26ms w/children — props: options
- `TidyCardContainerComponent` [React.memo] ×2 — 0.25ms self, 31.66ms w/children — props: children
- _... and 4 more_
- _Shown: 37.5ms self / 43.47ms commit (86%) — 4 more components not shown. Use `profiler-commit-query mode=by_index commit_index=5` to see all._

**CPU during this commit:**
- `[Host Function] completeRoot` self=27.79ms total=27.79ms ([host]:0)
- `[Host Function] link` self=15.16ms total=15.16ms ([host]:0)
- `addObjectDiffToProperties` self=0.52ms total=0.52ms (&platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src/app&unstable_transformProfile=hermes-stable:21076)

### Commit #6 — 4.98ms 🔵 (t=15.0s, margin)
> After: "Keep swipe 2" (0.6s prior)

- `SceneView` ×2 — 1.09ms self, 3.39ms w/children — props: options, clearOptions
- `NativeStackNavigator` — 0.94ms self, 4.98ms w/children — state: useState, useReducer
- `ScreenStackItem` [forwardRef] — 0.31ms self, 2.13ms w/children — props: sheetAllowedDetents, onWillAppear, onWillDisappear
- `ScreenStackHeaderConfig` — 0.26ms self, 0.4ms w/children — props: children, headerLeftBarButtonItems, headerRightBarButtonItems
- `InnerScreen` [forwardRef] — 0.23ms self, 1.74ms w/children — props: sheetAllowedDetents, style, scrollEdgeEffects
- `Animated(Anonymous)` — 0.22ms self, 1.35ms w/children — props: sheetAllowedDetents, onHeaderHeightChange, onWillAppear
- `NativeStackView` — 0.22ms self, 3.69ms w/children — props: descriptors, describe
- `NavigationProvider` ×2 — 0.2ms self, 2.75ms w/children — props: children
- `NavigationContent` — 0.16ms self, 3.99ms w/children — props: render, children
- `Anonymous` ×2 — 0.13ms self, 7.13ms w/children — props: children
- `ScreenStack` — 0.13ms self, 3.22ms w/children — props: nativeContainerStyle, children
- `FrameSizeProvider` — 0.12ms self, 3.42ms w/children — props: render
- `Context.Provider` ×22 — 0.11ms self, 43.58ms w/children — (mount)
- `Screen` — 0.08ms self, 1.82ms w/children — props: ref, sheetAllowedDetents, style
- `Freeze` — 0.07ms self, 1.47ms w/children — props: children
- _... and 15 more_
- _Shown: 4.3ms self / 4.98ms commit (86%) — 15 more components not shown. Use `profiler-commit-query mode=by_index commit_index=6` to see all._

### Commit #21 — 8.81ms 🔵 (t=39.4s, margin)
> After: "Keep swipe 5" (0.3s prior)

- `SceneView` ×2 — 2.29ms self, 6.97ms w/children — props: options, clearOptions
- `ScreenStackItem` [forwardRef] — 1.64ms self, 4.43ms w/children — props: sheetAllowedDetents, onWillAppear, onWillDisappear
- `NativeStackNavigator` — 1.05ms self, 8.81ms w/children — state: useState, useReducer
- `InnerScreen` [forwardRef] — 1.03ms self, 2.62ms w/children — props: sheetAllowedDetents, style, scrollEdgeEffects
- `NavigationProvider` ×2 — 0.28ms self, 5.04ms w/children — props: children
- `Animated(Anonymous)` — 0.28ms self, 1.36ms w/children — props: sheetAllowedDetents, onHeaderHeightChange, onWillAppear
- `NativeStackView` — 0.24ms self, 7.39ms w/children — props: descriptors, describe
- `Context.Provider` ×22 — 0.18ms self, 83.24ms w/children — (mount)
- `NavigationContent` — 0.17ms self, 7.71ms w/children — props: render, children
- `Screen` — 0.17ms self, 2.79ms w/children — props: ref, sheetAllowedDetents, style
- `ScreenStackHeaderConfig` — 0.16ms self, 0.33ms w/children — props: children, headerLeftBarButtonItems, headerRightBarButtonItems
- `ScreenStack` — 0.14ms self, 6.88ms w/children — props: nativeContainerStyle, children
- `FrameSizeProvider` — 0.12ms self, 7.09ms w/children — props: render
- `Anonymous` ×2 — 0.09ms self, 14.49ms w/children — props: children
- `DelayedFreeze` — 0.08ms self, 1.59ms w/children — props: children
- _... and 15 more_
- _Shown: 7.9ms self / 8.81ms commit (90%) — 15 more components not shown. Use `profiler-commit-query mode=by_index commit_index=21` to see all._

### Commit #22 — 18.16ms 🟡 (t=39.4s)
> After: "Keep swipe 5" (0.4s prior)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `AnimatedComponent(View)` re-rendered — props: style

Render cascade:
- `TidyHints` ×2 — 9.48ms self, 27.8ms w/children — parent re-render
- `Badge` ×6 — 5.5ms self, 15.71ms w/children — parent re-render
- `View` ×128 — 5.15ms self, 314.68ms w/children — parent re-render
- `AnimatedComponent(View)` ×34 — 4.17ms self, 81.11ms w/children — props: style
- `Text` ×14 — 0.84ms self, 1.97ms w/children — parent re-render
- `Canvas` ×6 — 0.64ms self, 0.72ms w/children — props: children
- `TidyCardComponent` [React.memo] ×2 — 0.62ms self, 30.7ms w/children — hooks
- `SymbolView` ×12 — 0.56ms self, 1.22ms w/children — parent re-render
- `AppSymbolIcon` ×12 — 0.55ms self, 1.76ms w/children — parent re-render
- `SymbolModule` ×12 — 0.49ms self, 0.66ms w/children — props: style, colors
- `Tint` ×6 — 0.46ms self, 1.84ms w/children — parent re-render
- `TidyCardContainerComponent` [React.memo] ×2 — 0.19ms self, 30.08ms w/children — props: children
- `ExpoImage` ×2 — 0.1ms self, 0.58ms w/children — (mount)
- `Image` — 0.09ms self, 0.41ms w/children — (mount)

**CPU during this commit:**
- `safelyDetachRef` self=15.03ms total=15.03ms (&platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src/app&unstable_transformProfile=hermes-stable:25174)
- `[Host Function] createTask` self=3.13ms total=3.13ms ([host]:0)

### Commit #23 — 0.83ms 🔵 (t=40.6s, margin)
> After: "Keep swipe 5" (1.6s prior)

- `AnimatedComponent(View)` ×50 — 3.93ms self, 13.91ms w/children — parent re-render
- `View` ×100 — 3.44ms self, 18.3ms w/children — props: style, ref

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `View` | 530 | 22.9ms | 0.04ms | 0.96ms | props: style, children, ref | — |
| `TidyHints` | 5 | 20.6ms | 4.12ms | 6.08ms | parent re-render | `tidy/tidy-hints.tsx:148` |
| `Badge` | 15 | 10.4ms | 0.7ms | 3.7ms | parent re-render | `tidy/tidy-hints.tsx:78` |
| `NativeStackNavigator` | 3 | 5.4ms | 1.81ms | 3.44ms | state: useState, useReducer | — |
| `SceneView` | 6 | 4.4ms | 0.73ms | 2.05ms | props: options, clearOptions, descriptor | — |
| `TidyCardComponent` [React.memo] | 5 | 3.1ms | 0.62ms | 1.27ms | hooks | `tidy/tidy-card.tsx:31` |
| `ScreenStackItem` [forwardRef] | 3 | 2.3ms | 0.76ms | 1.64ms | props: sheetAllowedDetents, onWillAppear, onWillDisappear | — |
| `Canvas` | 15 | 2.3ms | 0.15ms | 0.53ms | props: children | — |
| `Text` | 34 | 2.1ms | 0.06ms | 0.33ms | props: ref, children | — |
| `InnerScreen` [forwardRef] | 3 | 1.5ms | 0.49ms | 1.03ms | props: sheetAllowedDetents, style, scrollEdgeEffects | — |
| `Tint` | 15 | 1.4ms | 0.09ms | 0.21ms | parent re-render | `tidy/tidy-hints.tsx:49` |
| `AppSymbolIcon` | 30 | 1.4ms | 0.05ms | 0.16ms | parent re-render | `components/symbol.tsx:104` |
| `SymbolView` | 30 | 1.4ms | 0.05ms | 0.1ms | parent re-render | — |
| `SymbolModule` | 30 | 1.2ms | 0.04ms | 0.07ms | props: style, colors | — |
| `Screen` | 5 | 0.9ms | 0.18ms | 0.32ms | props: ref, sheetAllowedDetents, style | — |
| `TidyCardContainerComponent` [React.memo] | 5 | 0.9ms | 0.18ms | 0.44ms | props: children | `tidy/tidy-card-container.tsx:23` |
| `NativeStackView` | 3 | 0.8ms | 0.27ms | 0.36ms | props: descriptors, describe | — |
| `NavigationProvider` | 6 | 0.7ms | 0.12ms | 0.17ms | props: children | — |
| `ScreenStackHeaderConfig` | 3 | 0.5ms | 0.18ms | 0.26ms | props: children, headerLeftBarButtonItems, headerRightBarButtonItems | — |
| `NavigationContent` | 3 | 0.5ms | 0.17ms | 0.19ms | props: render, children | — |

---
## Suggested Improvements

### `View`

**Stabilize props:** `style`, `children`, `ref`. Likely inline objects/functions at the callsite — extract to constants or wrap with `useMemo`/`useCallback`.

### `TidyHints` — `tidy/tidy-hints.tsx:148`

**Parent trigger:** `View` is re-rendering unnecessarily. Fix the root cause in the parent first; this component will stop re-rendering as a side effect.

<details><summary>Source — `tidy/tidy-hints.tsx:148`</summary>

```tsx

export const TidyHints: FC = () => {
  useAppLocale();
  const { theme } = useUnistyles();

  return (
    <View style={styles.container} pointerEvents="none">
      <Tint direction="keep" color={theme.colors.keep} />
      <Tint direction="delete" color={theme.colors.danger} />
      <Tint direction="save" color={theme.colors.primary} />
      <View style={styles.topRow}>
        <Badge
          direction="delete"
          label={t("common.delete")}
          icon="trash"
          accentColor={theme.colors.danger}
        />
        <Badge
          direction="keep"
          label={t("tidy.keep")}
          icon="checkmark"
          accentColor={theme.colors.onKeep}
        />
      </View>
      <View style={styles.bottomRow}>
        <Badge
          direction="save"
          label={t("tidy.save")}
          icon="arrow.up"
          accentColor={theme.colors.primary}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
  },
  topRow: {
    // The swipe recognizer uses physical X coordinates in both layout directions.
    direction: "ltr",
    position: "absolute",
    top: theme.gap(3),
    left: theme.gap(3),
    right: theme.gap(3),
```

</details>

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

### `NativeStackNavigator`

**Unstable hook deps:** `useState`, `useReducer`. Check dependency arrays in `useEffect`/`useMemo` — a dependency may be recreated on every render.

### `SceneView`

**Stabilize props:** `options`, `clearOptions`, `descriptor`. Likely inline objects/functions at the callsite — extract to constants or wrap with `useMemo`/`useCallback`.


> 📝 Dev mode renders are ~3× slower than production. Divide ms values by ~3 for a rough production estimate.

---
## Next Steps

Ask the user which path to take:

1. **Investigate further** — use query tools to drill into specific findings before making changes:
   - `profiler-commit-query` mode=`by_index` commit_index=5 — full breakdown of the slowest commit
   - `profiler-cpu-query` mode=`component_cpu` component_name=`View` — CPU activity during this component's renders
   - `profiler-cpu-query` mode=`call_tree` — trace callers/callees of hot functions
2. **Implement fixes** — apply changes to the top offenders identified above, then re-profile the same scenario to measure improvement.
3. **Done for now** — save the report for reference.