#!/usr/bin/env node
// Measures how the item-detail header title paints, from a screen recording of
// one navigation, and judges it against the morph's contract.
//
//   node tools/measure-header-morph.mjs <recording.mp4> --from <frame> [--window 120] [--mode stagger|swap]
//
// The title band is cropped, converted to grayscale, and split into vertical
// columns. Stagger mode anchors on the blank band frame, then judges the
// entrance on saturation order, ramp length, monotonicity, and whether the
// baseline holds once settled. Swap mode starts on a screen whose title
// already painted and reports the largest single-frame column step, which is
// the native-to-canvas shift P1 exists to catch. The window must not contain
// the push transition, whose overlapping screens defeat ink-based anchoring.
//
// The blank band is not the font-resolve latency, and no number off this
// harness should be reported as one: the count starts only once the incoming
// header covers the band, and the entrance's own delay sits between the font
// arriving and the first ink. Time the font inside the app instead.
//
// Exits 0 when every predicate passes, 1 on a FAIL, 2 on INCONCLUSIVE.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const [video, ...rest] = process.argv.slice(2);
const usage =
  "usage: measure-header-morph.mjs <recording.mp4> --from <frame> [--window 120] [--mode stagger|swap]";
if (!video) {
  console.error(usage);
  process.exit(2);
}
// --from anchors the window past the push transition. Defaulting it to frame 0
// analyzed that transition instead, whose overlapping screens defeat ink-based
// anchoring and yield a confident but meaningless verdict, so it is required.
const integerArg = (name, { fallback, min }) => {
  const at = rest.indexOf(`--${name}`);
  if (at === -1) {
    if (fallback === undefined) {
      console.error(`${usage}\n--${name} is required`);
      process.exit(2);
    }
    return fallback;
  }
  const value = Number(rest[at + 1]);
  if (!Number.isInteger(value) || value < min) {
    console.error(`--${name} must be an integer of at least ${min}`);
    process.exit(2);
  }
  return value;
};
const from = integerArg("from", { min: 0 });
const window = integerArg("window", { fallback: 120, min: 1 });
const modeAt = rest.indexOf("--mode");
const mode = modeAt === -1 ? "stagger" : rest[modeAt + 1];
if (mode !== "stagger" && mode !== "swap") {
  console.error(usage);
  process.exit(2);
}
// --dump prints every row in the window and exits, to locate the frame where
// the push transition ends before anchoring an analysis window.
const dump = rest.includes("--dump");
const COLUMNS = 6;
// Fractions of the screen holding the native header title, measured from the
// accessibility frame of the title node on the item-detail screen. Fits the
// device it was measured on; re-derive it from `describe` for another screen
// size before trusting a number off this harness.
const BAND = { x: 0.227, y: 0.062, width: 0.545, height: 0.035 };

// Budgets the blank band is judged against, read from the motion tokens so the
// gate follows them instead of drifting. Each lookup is scoped to its own
// object: `enter` names both a duration and a spring.
const motionSource = await readFile(
  new URL("../apps/native/src/lib/motion.ts", import.meta.url),
  "utf8",
);
const token = (object, key, path) => {
  const body = new RegExp(`${object}\\s*\\{([^}]*)`).exec(motionSource)?.[1];
  const ms = Number(new RegExp(`\\b${key}:\\s*(\\d+)`).exec(body ?? "")?.[1]);
  if (!Number.isFinite(ms)) {
    console.error(`could not read ${path} from apps/native/src/lib/motion.ts`);
    process.exit(2);
  }
  return ms;
};
const enterMs = token("duration\\s*=", "enter", "motion.duration.enter");
const enterDelayMs = token(
  "textMorph:",
  "enterDelay",
  "motion.textMorph.enterDelay",
);

const run = (cmd, args, binary) =>
  new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    const out = [];
    proc.stdout.on("data", (d) => out.push(d));
    proc.stderr.on("data", (d) => process.stderr.write(d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`${cmd} exited ${code}`));
      resolve(binary ? Buffer.concat(out) : Buffer.concat(out).toString());
    });
  });

const probe = await run("ffprobe", [
  "-v", "error",
  "-select_streams", "v:0",
  "-show_entries", "stream=width,height,r_frame_rate",
  "-of", "default=nw=1:nk=1",
  video,
]);
const [width, height, rate] = probe.trim().split("\n");
const [num, den] = rate.split("/").map(Number);
const fps = num / (den || 1);
// The blank band may not outlast the hold budget plus the entrance's own delay:
// the count starts once the incoming header covers the band, and the first ink
// trails the resolved font by textMorph.enterDelay, so a limit without it fails
// a recording whose font arrived on time. Two frames of sampling slack, taken
// from this recording's rate so the allowance means the same at 30fps as at 60
// rather than the four frames a fixed 67ms bought at one of them.
const HOLD_LIMIT_MS = Math.round(enterMs + enterDelayMs + 2000 / fps);
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const cw = even(Number(width) * BAND.width);
const ch = even(Number(height) * BAND.height);
const cx = even(Number(width) * BAND.x);
const cy = even(Number(height) * BAND.y);

const raw = await run(
  "ffmpeg",
  ["-v", "error", "-i", video, "-vf", `crop=${cw}:${ch}:${cx}:${cy},format=gray`,
   "-f", "rawvideo", "-pix_fmt", "gray", "-"],
  true,
);

const FRAME = cw * ch;
const total = Math.floor(raw.length / FRAME);
const frames = [];
for (let f = from; f < Math.min(total, from + window); f++) {
  const base = f * FRAME;
  const columns = new Array(COLUMNS).fill(0);
  let ink = 0;
  let weighted = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const v = raw[base + y * cw + x];
      if (v >= 235) continue;
      const dark = 235 - v;
      columns[Math.min(COLUMNS - 1, Math.floor((x / cw) * COLUMNS))] += dark;
      ink += dark;
      weighted += dark * y;
    }
  }
  frames.push({
    f,
    ms: Math.round(((f - from) * 1000) / fps),
    ink,
    columns,
    cy: ink > 0 ? weighted / ink : null,
  });
}

const inconclusive = (why) => {
  console.log(`INCONCLUSIVE  ${why}`);
  process.exit(2);
};
const verdict = (name, pass, detail) =>
  console.log(`${pass ? "PASS" : "FAIL"}  ${name.padEnd(26)} ${detail}`);
const row = (r) =>
  console.log(
    String(r.f).padStart(5) +
      String(r.ms).padStart(7) +
      r.columns.map((c) => String(Math.round(c / 100)).padStart(7)).join("") +
      String(Math.round(r.ink / 100)).padStart(8) +
      (r.cy === null ? "      -" : r.cy.toFixed(1).padStart(7)),
  );

console.log(`${video}`);
console.log(`band ${cw}x${ch} at (${cx},${cy}) of ${width}x${height} @ ${fps}fps, mode ${mode}, frames ${from}..${from + frames.length - 1}`);
console.log("frame     ms" + Array.from({ length: COLUMNS }, (_, i) => `c${i}`.padStart(7)).join("") + "     ink     cy");
if (dump) {
  for (const r of frames) row(r);
  process.exit(0);
}

if (mode === "stagger") {
  const tail = frames.slice(-5).map((r) => r.ink).sort((a, b) => a - b);
  const peak = tail[tail.length - 1];
  const floor = peak * 0.02;
  if (peak === 0) inconclusive("no ink anywhere in the window; anchor --from on the navigation");
  if (tail[tail.length - 1] - tail[0] > peak * 0.02) {
    inconclusive("the window ends while the paint still changes; raise --window");
  }
  let anchor = -1;
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].ink <= floor) {
      anchor = i;
      break;
    }
  }
  if (anchor === -1) {
    inconclusive("no blank hold frame in the window; anchor --from before the title paints");
  }
  let hold = 0;
  for (let i = anchor; i >= 0 && frames[i].ink <= floor; i--) hold++;
  const appear = frames.findIndex((r, i) => i > anchor && r.ink > floor);
  const settleAt = appear === -1 ? -1 : frames.findIndex((r, i) => i >= appear && r.ink >= peak * 0.98);
  if (appear === -1 || settleAt === -1) inconclusive("the window holds no entrance after the hold; check --from");
  const settled = frames[settleAt];
  for (const r of frames.slice(Math.max(0, anchor - 1), settleAt + 4)) row(r);

  // Column saturation order. A stagger reaches each column's own 90% left to right.
  const saturation = settled.columns.map((finalInk, index) => {
    if (finalInk < peak * 0.05) return null;
    const hit = frames.find((r, i) => i >= appear && r.columns[index] >= finalInk * 0.9);
    return hit ? hit.ms : null;
  });
  const lit = saturation.filter((ms) => ms !== null);
  // Adjacent columns legitimately tie: the per-glyph stagger is shorter than a
  // frame, so two columns can saturate in the same one. What separates a
  // stagger from a uniform cross-fade is that the whole run spreads over
  // several frames, so order alone is not enough to pass.
  const ordered = lit.every((ms, i) => i === 0 || ms >= lit[i - 1]);
  const spread = lit.length > 1 ? lit[lit.length - 1] - lit[0] : 0;
  // Four frames of this recording, not a fixed 67ms that means four frames at
  // 60fps and two at 30.
  const spreadMinMs = Math.round(4000 / fps);
  const staggered = ordered && lit.length > 1 && spread >= spreadMinMs;
  const ramp = settled.ms - frames[appear].ms;

  // Post-settle layout drift. A native-to-canvas swap moves glyphs after the
  // title already read as complete, which is the artifact that must not happen.
  let drift = 0;
  for (const r of frames.slice(settleAt + 1)) {
    for (let i = 0; i < COLUMNS; i++) {
      const delta = Math.abs(r.columns[i] - settled.columns[i]) / Math.max(1, peak);
      if (delta > drift) drift = delta;
    }
  }
  // Column ink barely moves when the swap is a pure vertical translation, so
  // the baseline is judged on its own. This catches the swap on any title,
  // where a per-column ink threshold depends on which letters the title has.
  // The limit clears the ~1.6px of anti-aliasing wobble a settled title shows
  // and still catches the measured 5.5px native-to-canvas step.
  let baselineShift = 0;
  for (const r of frames.slice(settleAt + 1)) {
    if (r.cy === null) continue;
    const delta = Math.abs(r.cy - settled.cy);
    if (delta > baselineShift) baselineShift = delta;
  }
  let dips = 0;
  for (let i = appear + 1; i <= settleAt; i++) {
    if (frames[i].ink < frames[i - 1].ink * 0.98) dips++;
  }
  const holdMs = Math.round((hold * 1000) / fps);

  console.log("");
  console.log(`blank band before the entrance: ${hold} frame(s), ${holdMs}ms`);
  console.log(`  this is not the font-resolve latency: it starts once the incoming`);
  console.log(`  header covers the band, and the first ink trails the font by about`);
  console.log(`  morph.enterDelay. Time the font in the app, not from a recording.`);
  console.log(`column saturation (ms): ${saturation.map((ms) => (ms === null ? "-" : ms)).join(" ")}`);
  console.log(`centroid ${frames[appear].cy.toFixed(1)} -> ${settled.cy.toFixed(1)}`);
  console.log("");
  verdict("P1 no double paint", drift <= 0.02, `max post-settle column drift ${(drift * 100).toFixed(1)}% (limit 2%)`);
  verdict("P1 baseline holds", baselineShift <= 3, `max post-settle baseline shift ${baselineShift.toFixed(1)}px (limit 3px)`);
  verdict("P2 entrance staggered", staggered, `${ordered ? "left to right" : "out of order"} across ${lit.length} columns, spread ${spread}ms (want ${spreadMinMs}ms or more)`);
  verdict("P2 ramp in budget", ramp >= 300 && ramp <= 1200, `${ramp}ms (want 300-1200ms)`);
  verdict("P2 ink monotonic", dips === 0, `${dips} frames dipped more than 2%`);
  verdict("P4 bounded absence", holdMs <= HOLD_LIMIT_MS, `blank band ${holdMs}ms (limit ${HOLD_LIMIT_MS}ms, and this is not the font latency)`);
  const pass =
    drift <= 0.02 && baselineShift <= 3 && staggered &&
    ramp >= 300 && ramp <= 1200 && dips === 0 && holdMs <= HOLD_LIMIT_MS;
  process.exitCode = pass ? 0 : 1;
} else {
  const peak = Math.max(...frames.map((r) => r.ink));
  const floor = peak * 0.02;
  if (peak === 0) inconclusive("no ink anywhere in the window; anchor --from on the navigation");
  const appear = frames.findIndex((r) => r.ink > floor);
  if (appear === -1) inconclusive("the title never paints in the window; check --from");
  let worst = { delta: 0, at: -1, col: -1 };
  for (let i = appear + 1; i < frames.length; i++) {
    for (let c = 0; c < COLUMNS; c++) {
      const delta = Math.abs(frames[i].columns[c] - frames[i - 1].columns[c]) / peak;
      if (delta > worst.delta) worst = { delta, at: i, col: c };
    }
  }
  for (const r of frames.slice(appear, (worst.at === -1 ? appear : worst.at) + 2)) row(r);
  console.log("");
  console.log(`title painted at ${frames[appear].ms}ms, ${appear} blank frame(s) before it`);
  if (worst.at === -1) {
    verdict("P1 no double paint", true, "no frame-to-frame column change after the paint");
    process.exitCode = 0;
  } else {
    console.log(`largest single-frame column step: c${worst.col} ${(worst.delta * 100).toFixed(1)}% of peak ink at ${frames[worst.at].ms}ms`);
    verdict("P1 no double paint", worst.delta <= 0.02, `max column step ${(worst.delta * 100).toFixed(1)}% (limit 2%)`);
    process.exitCode = worst.delta <= 0.02 ? 0 : 1;
  }
}
