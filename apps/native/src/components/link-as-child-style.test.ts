import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// `<Link asChild>` and `<Link.Trigger>` render expo-router's Slot, which merges
// the child's `style` by object spread. A Pressable style function spreads to
// `{}`, so the child silently renders unstyled on every platform (the save
// recall card collapsed into a screen-tall empty box). Component tests mock
// expo-router and cannot see this, so the rule is checked on the source.
// Put the styles on an inner View driven by the Pressable's render-prop
// children, or navigate with router.push instead of Link.

const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
  });
}

/** End index of the JSX opening tag starting at `start`, skipping `>` inside
 * `{...}` expressions such as arrow functions. */
function openingTagEnd(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === ">" && depth === 0) return i;
  }
  return source.length;
}

/** Line numbers of style functions inside a `<Link asChild>` block. */
function slottedStyleFunctions(source: string): number[] {
  const lines: number[] = [];
  const linkOpen = /<Link\b/g;
  for (const match of source.matchAll(linkOpen)) {
    const start = match.index;
    const tagEnd = openingTagEnd(source, start);
    const tag = source.slice(start, tagEnd);
    if (!/\basChild\b/.test(tag) || source[tagEnd - 1] === "/") continue;
    const close = source.indexOf("</Link>", tagEnd);
    const block = source.slice(tagEnd, close === -1 ? undefined : close);
    for (const style of block.matchAll(/\bstyle=\{\s*\(/g)) {
      lines.push(source.slice(0, tagEnd + style.index).split("\n").length);
    }
  }
  return lines;
}

describe("Link asChild children", () => {
  it("flags a Pressable style function under Link asChild", () => {
    const source = [
      '<Link href="/x" asChild>',
      "  <Pressable style={({ pressed }) => [styles.card]} />",
      "</Link>",
      '<Link href="/y">',
      "  <Pressable style={({ pressed }) => [styles.card]} />",
      "</Link>",
    ].join("\n");
    expect(slottedStyleFunctions(source)).toEqual([2]);
  });

  it("never passes a style function to a slotted child", () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      slottedStyleFunctions(readFileSync(file, "utf8")).map(
        (line) => `${relative(SRC, file)}:${line}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
