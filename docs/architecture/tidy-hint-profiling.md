# Tidy hint profiling

Use this protocol before claiming that Tidy hints are a bottleneck. It defines a baseline, not
an optimization or a completed measurement. Mounted canvases and React render
times alone do not establish native frame, CPU or memory cost.

## Safe, repeatable setup

- Use an isolated development device and anonymous development account with
  disposable fixtures. Confirm the development bundle and backend, never
  production. Follow [local QA](local-qa.md) for login and fixture setup.
- The device photo library must contain exactly the Tidy batch size
  (`BATCH_SIZE`, currently 24) of synthetic images and no
  personal photos. If isolation cannot be confirmed, stop. Never clear an
  existing library, delete personal photos or reset a real account.
- Generate numbered images `tidy-01` through `tidy-24`: 12 portrait
  (1200 × 1600), 12 landscape (1600 × 1200), opaque sRGB PNGs, alternating
  orientation by number. Use geometric shapes, fixed colors and the visible
  image number, not downloaded images or user content. Keep the same bytes
  for every run.
- Keep a manifest with filename, SHA-256, dimensions, format, byte size,
  import order and creation timestamp. Confirm the actual displayed deck
  order before recording; library order need not equal import order.
- Import once through an authorized device transfer. For supplementary iOS
  simulator work, use `xcrun simctl addmedia <qa-udid> <24-png-paths>`.
  Do not import another copy for each repetition. Verify 24 available photos
  and full Photos permission before opening the deck.
- Use Keep for committed-swipes measurements. Undo it before leaving Tidy.
  Do not commit Delete or Save to create avoidable photo/backend changes.
  Cancelled drags may show all three directions without committing them.
  Restore all decisions before leaving the screen, since blur can settle them.

Record the following in each run's metadata:

| Field       | Required value                                                                         |
| ----------- | -------------------------------------------------------------------------------------- |
| Source      | Full commit SHA, clean worktree, dependency lockfile hash                              |
| Binary      | Bundle/package ID, build ID, native fingerprint, Expo/RN/Hermes versions               |
| Build       | Debug/profile/release, JS dev flag, React Compiler/Strict Mode, profiler configuration |
| Device      | Physical model, OS build, chip, RAM, display refresh-rate setting                      |
| Viewport    | Logical points/dp and pixels, scale, orientation, safe area, text size                 |
| Preferences | Theme, locale, Reduce Motion, low-power mode                                           |
| Environment | Battery level, charging state, thermal state, background apps, network state           |
| Content     | Manifest hash, photo order, fixture state, permission scope                            |
| Capture     | Tool/version, template/data sources, clock/time origin, cache state, run ID            |

Use portrait orientation, default text size, fixed theme/locale, low-power mode
off and a cool device. Fix charging and refresh-rate settings across runs.
Relaunch after changing Reduce Motion (see [local QA](local-qa.md#getting-into-a-specific-state)).
Run the complete matrix separately with Reduce Motion off and on.

Use a release-mode development build for the primary baseline if signing and
tool attachment support it. Otherwise label the actual profileable build and
its limitations, and do not extrapolate debug timings to production. Keep
Metro, debugger and recording attachment identical in later comparisons.

## Pre-register before capture

Record the following together in the run plan before seeing results:

- **Materiality thresholds:** accept the proposed thresholds below or record
  alternatives. A finding must recur in at least four of five valid warm
  repetitions and exceed the noise band:
  - Missed-deadline fraction at least 5%, with symbolized hint/worklet/Skia
    activity accounting for at least 20% of sampled CPU in those windows
    and critical-path evidence that hint work delays presentation. Overlap
    alone does not qualify; unresolved dependencies or misses explained by
    decoding or another task make frame attribution BLOCKED; or
  - Hint-attributed CPU at least 5% of one core averaged over the window; or
  - At least 5 MiB retained native allocations attributed to hints/canvases
    after restoration, not decoded images or general renderer caches.
- **Paired-control plan:** for each scenario, five paired controls using the
  same native capture with React profiling/recording attached and detached.
  Take the mounted census outside timing runs.
- **Noise-band method:** the larger within-condition max-minus-min range
  across five repetitions, plus the absolute difference between attached
  and detached medians, in the metric's native units (CPU percentage points,
  MiB or missed-deadline percentage points). Findings and improvements must
  exceed this band. If it obscures the threshold, gather more controlled
  evidence or report BLOCKED.
- **Comparison target:** name the specific attributed metric and target:
  at least 15% improvement in CPU or retained memory cost, or at least
  2 percentage points fewer missed deadlines for a frame finding, exceeding
  the noise band. Require identical conditions and no swipe/Undo regression;
  reduced canvas counts do not substitute for measured benefit.

## Scenarios and timing

Warm the 24-photo deck once before measured runs: inspect every card, Keep
through the deck, then repeatedly Undo to restore its original order. Wait
10 seconds after restoration. Record first-open/cold decoding separately,
never mix it into the warm baseline. A relaunch alone does not prove a cold
OS image cache; label unconfirmed cold state as unknown.

Capture each scenario independently, starting with the same full deck and
ending with its original order. Include 5 seconds of pre-roll and 5 seconds
of post-roll outside the analysis window. Record actions and timestamps in a
sidecar file or synchronized recording.

| Scenario                | Analysis window and actions                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Idle full deck          | 30 seconds, no touches, all 24 card shells present                                                                                                           |
| Slow directional return | 30 seconds: ten 3-second cycles, drag right/left/up in rotation to about 80% of the displacement commit threshold, reverse through center, release at center |
| Cancelled swipe         | 30 seconds: ten 3-second cycles, alternate left/right/up below threshold, hold 1 second, release slowly without a fling; verify no deck advance              |
| Rapid committed swipes  | Ten right/Keep swipes at one swipe per second, then 5 seconds settling; record actual cadence and resulting card numbers                                     |
| Single Undo             | Set up one Keep before pre-roll; 10 seconds containing one Undo at second 2, inspect restored number and hint feedback                                       |
| Repeated Undo           | Set up ten Keeps before pre-roll; ten Undos at one per second, then 5 seconds settling; verify all original numbers/order                                    |

Read the tested revision's swipe thresholds and velocity rules, and record
gesture displacement and duration. Slow/cancelled releases must not cross a
velocity commit threshold. If a cancel advances, mark the run invalid and
restore the deck, rather than relabelling it as cancellation.

Code owners: batch size is in
[`use-photo-batch.ts`](../../apps/native/src/lib/tidy/use-photo-batch.ts);
`swipeProgress` and `MOMENTUM_WINDOW_S` are in
[`swipe-decision.ts`](../../apps/native/src/lib/tidy/swipe-decision.ts);
the `TidyHints` overlays and badge canvases are in
[`tidy-hints.tsx`](../../apps/native/src/components/tidy/tidy-hints.tsx).
Use these files at the tested revision rather than assuming constants stayed fixed.

Perform five valid repetitions of each scenario per preference. Allow at
least 30 seconds cooling between runs, longer if thermally throttled. Record
invalid runs and reasons. Restore deck order, history and fixture state before
the next run; do not reset shared fixtures while another tester uses them.

## Measurements

Report each repetition, then the median and range across repetitions. Keep
scenario windows separate; do not hide mounting spikes in idle averages.

- **Mounted content:** count `TidyHints` subtrees as overlays and badge Skia
  `Canvas` instances beneath each subtree, not every canvas in the app.
  Capture initial settled, interior, near-end, restored and transient
  swipe/Undo states. Record timestamps and the count method. Use a complete
  React fiber/component tree where supported and cross-check native view
  inspection; hidden/transparent is still mounted. Save the filtered tree
  and count procedure. A truncated tree is not a valid census.
- **Frames:** actual presented-frame intervals, p50/p95/p99, missed-deadline
  fraction, hitch count/duration and longest hitch, using the device's
  observed frame deadline (not a universal 16.7 ms). Report gesture and Undo
  windows separately.
- **CPU:** process CPU time divided by window length, sampled CPU milliseconds
  by JS, main/UI, Reanimated worklet and Skia/render threads where identifiable.
  Include sampling interval, symbols and unresolved stacks. React commit
  count and p50/p95/max commit duration are supplementary.
- **Memory:** native resident/physical footprint, peak, live allocations and
  retained growth after restoring the deck. Take snapshots before open,
  after settle, after swipes and 10, 30 and 60 seconds after repeated Undo.
  Count retained hint allocations only if still live at both 30 and 60
  seconds; report transient cleanup separately. State unavailable
  counters; JS heap is not native memory.

Inspection and React profiling can add overhead. Run the paired controls and
apply the noise-band method in [Pre-register before capture](#pre-register-before-capture).
Do not claim a speedup from changed instrumentation.

## Physical iOS: Instruments and xctrace

Use an authorized, connected, isolated iPhone. A simulator React profiler,
regardless of the tool driving it, does not satisfy physical-device acceptance.

1. In Instruments, select the device and exact Shelvr development binary.
   Record Animation Hitches (or Core Animation frame information available on
   that OS) with Time Profiler. Verify presented frames and thread symbols
   appear before taking the five repetitions.
2. Collect Allocations and VM Tracker/physical footprint in a separate pass
   when combined instrumentation distorts timing. Match scenario and metadata.
3. For repeatable command-line capture, discover the installed templates and
   device IDs rather than assuming names exist:

   ```sh
   xcrun xctrace list devices
   xcrun xctrace list templates
   xcrun xctrace record --device '<physical-device-id>' \
     --template '<verified-template-name>' \
     --attach '<shelvr-process-pid>' --time-limit 40s \
     --output '<new-run-directory>/idle.trace'
   xcrun xctrace export --input '<run-directory>/idle.trace' --toc
   ```

   Use the appropriate capture length for each scenario plus pre/post-roll.
   Export tables using the schemas listed by the trace TOC, and preserve the
   original `.trace`. If attachment, symbols or frame data are missing,
   record that limitation instead of substituting React render durations.

## Physical Android: Perfetto

Use an authorized, isolated physical Android device. Emulator traces do not
count as physical-device acceptance.

Use the device's Developer options → System tracing interface to record and
share a Perfetto trace. Use a profileable
development binary. Enable the available graphics/FrameTimeline, scheduler,
CPU frequency and process-memory counters; record OS and source availability.
Open the trace in Perfetto and select Shelvr's process/surface:

- Correlate expected and actual FrameTimeline slices with jank types and
  missed presentation deadlines (Android 12+ where available).
- Inspect thread scheduling/running time and frequency changes. Add supported
  CPU stack sampling in an authorized profiling pass if System tracing does
  not supply it; scheduler data alone cannot identify hint functions.
- Inspect RSS/process memory counters. Use an authorized native heap profiler
  such as heapprofd if the build/device supports it, in a separate matched
  pass. Missing heap samples mean allocation attribution is unverified.

If the device cannot collect the required stacks/frame data, the decision is
BLOCKED, not a CPU attribution inferred from scheduling or canvas counts.
Use the same device, OS, binary mode, trace configuration, photos and scenario
cadence in any later comparison.

## Attribution, materiality and decision

Apply the thresholds, repetition requirement and noise band recorded in
[Pre-register before capture](#pre-register-before-capture).

Separate decoding/upload stacks, network/fixture work, general renderer work
and profiler overhead from hint progress, opacity subscriptions and badge
path/render work. Generic Skia or Reanimated samples without resolved callers
are not enough. Compare idle, drag, Undo and cold/warm stacks; a slow frame
coinciding with image decode is not proof against hints. If attribution remains
ambiguous, stop at BLOCKED. This protocol does not add product instrumentation.

| Decision    | Evidence required                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PROCEED     | Physical-device traces and accessible artifact links, accepted threshold crossed repeatedly, resolved hint attribution, and the named cost a later comparison must improve                 |
| NOT PURSUED | Complete, valid physical-device matrix with adequate attribution coverage, no meaningful hint cost against the accepted threshold; leave product code unchanged as the measurement outcome |
| BLOCKED     | No safe physical device/build, unavailable required metrics/symbols, unacceptable confounding/noise, or inconclusive attribution; list what is missing, never call acceptance complete     |

Evaluate later comparisons against the pre-registered metric and target.

Publish a redacted evidence bundle containing metadata, synthetic manifest,
scenario timestamps, all per-run metric tables, filtered count artifacts,
raw native traces and a short attribution/decision note with trace-window
references. Keep secrets, identifiers and user data out; use owner-approved
storage with links the reviewer can open. If using simulator React profiling
as an exploratory supplement, label every result **exploratory, simulator,
not acceptance**, record the dev-mode/profiler overhead and missing native
metrics, and leave the physical-device decision open.
