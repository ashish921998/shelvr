# Exploratory Tidy hint-overlay profiling for issue #314

Exploratory, simulator, not acceptance evidence. These numbers come from a debug
JS bundle served by Metro on an iOS simulator. They do not establish or rule out
a bottleneck on a real device. The real-device protocol is in PR #329
(`docs/architecture/tidy-hint-profiling.md`).

## Conditions

- Source: `origin/main` at `135dc95f8fcc6d8bdd19bdd02bbaf08353f6d3cc` in the
  `issues-mission` worktree (detached, clean).
- Simulator: QA iPhone 17 Pro Max, iOS 26.5 (23F77), headless (no Simulator.app),
  macOS 26.7, Xcode 27.0.
- Build: installed dev client `app.shelvr.save.dev` (CFBundleShortVersionString 1.0.7,
  build 1) loading the debug JS bundle from Metro on port 8095 (`dev=true`,
  Hermes 250829098.0.16, bridgeless). `app.json` version on this commit is 1.0.10.
- Libraries on this commit: expo ~57.0.12, react-native 0.86.2, react 19.2.3,
  react-native-reanimated 4.5.1, @shopify/react-native-skia 2.6.2, expo-image ~57.0.0,
  react-native-gesture-handler ~2.32.0. React Compiler: off. Strict mode: not reported.
- Reduce Motion: off (`ReduceMotionEnabled` = 0) before and after; nothing was changed.
- Photo library: 6 stock simulator photos (IMG_0001 to IMG_0006, left untouched) plus
  24 synthetic solid-colour PNGs added for this run (see `synthetic-photos-manifest.txt`),
  30 assets total. Tidy's `BATCH_SIZE` is 24, so the deck was exactly the 24 synthetic
  photos (header read `0 / 24`).
- Sign in: anonymous dev login with dev fixtures (Pro entitlement from fixtures).
- Tooling: Argent 0.27.0 React profiler (`react-profiler-start/stop/analyze`) plus
  direct reads of the in-app React DevTools backend (`getProfilingData()`) over the
  Argent debugger for per-commit durations and updater attribution. Gestures were
  Argent `gesture-swipe` / `gesture-tap`, which adds about 8 s between swipes, so the
  "rapid" scenario is five fast 150 ms gestures, not back-to-back swipes.

## Files

| File | What it is |
| --- | --- |
| `01-tidy-deck-initial.png` | Deck at rest, 0 / 24 |
| `02-tidy-after-five-keeps.png` | After the fifth Keep, 5 / 24 |
| `03-tidy-after-undo.png` | After Undo, 4 / 24 |
| `census.md` | Mounted hint overlay and canvas counts, at rest and after swipes + Undo |
| `synthetic-photos-manifest.txt` | Generator command, filenames, sizes |
| `s1-idle-*` | Idle session: Argent report, commits JSON, CPU self-time summary |
| `s2-cancelled-swipe-*` | Slow drag released below threshold: report, Argent commits JSON, DevTools per-commit JSON, CPU summary |
| `s3-five-keep-swipes-*` | Five Keep swipes: report, Argent commits JSON, DevTools per-commit JSON, CPU summary |
| `s4-undo-*` | One Undo: report, Argent commits JSON, CPU summary |

The Argent `*-commits.json` files only keep detail for commits at or above the 16 ms
"hot" floor, so for sessions with none they are empty; the `*-devtools-commits.json`
files and `census.md` carry the full per-commit list.
