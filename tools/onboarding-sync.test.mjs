import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

const CATALOG = "apps/native/src/locales/en.json";
const STEPS = "apps/native/src/lib/onboarding-steps.ts";
const NOTES = "docs/app-review-notes.md";
const FLOWS = "tools/e2e/tests/fresh-onboarding.ts";

const flowVersion = (source) =>
  Number(/ONBOARDING_FLOW_VERSION = (\d+)/.exec(source)?.[1]);

for (const path of [NOTES, FLOWS]) {
  test(`${path} was walked against the current onboarding`, () => {
    const stamp = /onboarding-flow-version: (\d+)/.exec(read(path));
    assert.ok(stamp, `${path} has no "onboarding-flow-version: N" line.`);
    const current = flowVersion(read(STEPS));
    assert.equal(
      Number(stamp[1]),
      current,
      `${path} was last walked against onboarding flow version ${stamp[1]}; ${STEPS} is at ${current}. Walk it against the new flow (steps, their order, button labels), fix what moved, then set its onboarding-flow-version line to ${current}.`,
    );
  });
}

const straighten = (text) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const normalize = (text) => straighten(text).replace(/\s+/g, " ").trim();

function showing(strings) {
  const shown = new Set(strings.map(normalize));
  return (text) => {
    const words = text.split(" ");
    const reachable = new Array(words.length + 1).fill(false);
    reachable[words.length] = true;
    for (let start = words.length - 1; start >= 0; start--) {
      for (let end = start + 1; end <= words.length; end++) {
        if (reachable[end] && shown.has(words.slice(start, end).join(" "))) {
          reachable[start] = true;
          break;
        }
      }
    }
    return reachable[0];
  };
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
      if (!text.endsWith(":") && !/^[a-z]/.test(text)) {
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

test("the App Review notes quote only text the app shows", () => {
  const isShown = showing([
    ...catalogStrings(JSON.parse(read(CATALOG))),
    ...swiftStrings("apps/native/app-intents"),
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
