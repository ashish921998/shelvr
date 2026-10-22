import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

const CATALOG = "apps/native/src/locales/en.json";
const STEPS = "apps/native/src/lib/onboarding-steps.ts";
const NOTES = "docs/app-review-notes.md";
const FLOWS = "tools/e2e/tests/fresh-onboarding.ts";
const WALKS = "tools/onboarding-walks.json";

const flowVersion = (source) =>
  Number(/ONBOARDING_FLOW_VERSION = (\d+)/.exec(source)?.[1]);

for (const path of [NOTES, FLOWS]) {
  test(`${path} was walked against the current onboarding`, () => {
    assert.ok(
      existsSync(join(root, path)),
      `${path} is gone. Point NOTES and FLOWS in this test, and ${WALKS}, at its new path.`,
    );
    const walked = JSON.parse(read(WALKS))[path];
    assert.ok(Number.isInteger(walked), `${WALKS} has no number for ${path}.`);
    const current = flowVersion(read(STEPS));
    assert.equal(
      walked,
      current,
      `${path} was last walked against onboarding flow version ${walked}; ${STEPS} is at ${current}. Walk it against the new flow (steps, their order, button labels), fix what moved, then set its number in ${WALKS} to ${current}.`,
    );
  });
}

// The paywall is built in RevenueCat, so its text is in no file here. Edit this list when the paywall copy changes.
const PAYWALL = [
  "Save the link. Shelvr does the filing.",
  "Get a heads-up before you pay",
  "Pick a plan",
  "Yearly",
  "Weekly",
  "Try for $0.00, then <price>/year",
  "Subscribe for <price>/week",
  "Restore",
];

const straighten = (text) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const normalize = (text) => straighten(text).replace(/\s+/g, " ").trim();

// Screens that render two catalog strings one after the other. A quote may join
// exactly these pairs, and only while both parts are still in the catalog.
const COMPOSED = [
  ["Already have an account?", "Sign in"],
  ["Read and titled.", "It goes on your shelf once you're in."],
  ["Last thing.", "Make it count."],
];

function showing(strings) {
  const shown = new Set(strings.map(normalize));
  for (const parts of COMPOSED) {
    if (parts.every((part) => shown.has(normalize(part)))) {
      shown.add(normalize(parts.join(" ")));
    }
  }
  return (text) => shown.has(normalize(text));
}

const BLOCK_START = /^(#{1,6} |[-*] |\d+\. |\|)/;

function quotedCopy(markdown) {
  const blocks = [];
  let inOnboarding = false;
  let block = null;
  straighten(markdown)
    .split("\n")
    .forEach((line, index) => {
      if (!line.trim() || BLOCK_START.test(line)) block = null;
      if (line.startsWith("## "))
        inOnboarding = line.startsWith("## Onboarding");
      if (!line.trim()) return;
      if (!block) {
        block = { line: index + 1, text: "", inOnboarding };
        blocks.push(block);
      }
      block.text += ` ${line}`;
    });
  const quotes = [];
  for (const { line, text: source, inOnboarding: bold } of blocks) {
    const pattern = bold ? /\*\*([^*]+)\*\*|"([^"]+)"/g : /"([^"]+)"/g;
    for (const [, boldText, quoted] of source.matchAll(pattern)) {
      const text = normalize(boldText ?? quoted);
      // "Opener:" labels a step and "not" is emphasis; neither is on screen.
      if (!text.endsWith(":") && text !== "not") {
        quotes.push({ line, text });
      }
    }
  }
  return quotes;
}

function* catalogStrings(value) {
  if (typeof value === "string") yield value;
  else if (value && typeof value === "object") {
    for (const inner of Object.values(value)) yield* catalogStrings(inner);
  }
}

function* swiftStrings(directory) {
  for (const entry of readdirSync(join(root, directory), {
    withFileTypes: true,
  })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* swiftStrings(path);
    else if (entry.name.endsWith(".swift")) {
      for (const [, text] of read(path).matchAll(/"((?:[^"\\\n]|\\.)+)"/g)) {
        yield text;
      }
    }
  }
}

test("unrelated strings are not joined", () => {
  const isShown = showing(["Already have an account?", "Sign in", "Continue"]);
  assert.ok(isShown("Already have an account? Sign in"));
  assert.ok(!isShown("Already have an account? Continue"));
  assert.ok(!showing(["Sign in"])("Already have an account? Sign in"));
});

test("the matcher takes a title and its accent, and not a retired title", () => {
  const isShown = showing([
    "Last thing.",
    "Make it count.",
    "Save your first post.",
  ]);
  assert.ok(isShown("Last thing. Make it count."));
  assert.ok(isShown("Save your first post."));
  // PR 438 renamed the share step and left this quote in the notes.
  assert.ok(!isShown("Save this post the way you will in any app."));
});

test("a quote wrapped over two lines is read, and list items stay apart", () => {
  assert.deepEqual(
    quotedCopy(
      '3. Tap "Save this post the way\n   you will in any app." to share.',
    ),
    [{ line: 1, text: "Save this post the way you will in any app." }],
  );
  assert.deepEqual(quotedCopy('- a "Start yours\n- b Continue"'), []);
});

test('a lowercase quote is checked; only the emphasis "not" is skipped', () => {
  assert.deepEqual(
    quotedCopy('Tap "unlock the full trip", never "not" or "Opener:".'),
    [{ line: 1, text: "unlock the full trip" }],
  );
});

test("the App Review notes quote only text the app shows", () => {
  const isShown = showing([
    ...catalogStrings(JSON.parse(read(CATALOG))),
    ...swiftStrings("apps/native/app-intents"),
    ...PAYWALL,
  ]);
  const stale = quotedCopy(read(NOTES))
    .filter(({ text }) => !isShown(text))
    .map(({ line, text }) => `${NOTES}:${line} "${text}"`);
  assert.deepEqual(
    stale,
    [],
    `These quotes are in neither ${CATALOG} nor the App Intents. If a screen's text changed, quote the new text. If it is not Shelvr's own text, take it out of quotes and bold.`,
  );
});
