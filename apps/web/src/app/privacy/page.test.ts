import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PrivacyPage from "./page";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../..");

const RATE_LIMITED_FEATURES: Record<string, string[]> = {
  "app/api/android-waitlist/route.ts": ["waitlist"],
  "app/api/oracle/route.ts": ["Oracle"],
  "app/api/plan-vote/route.ts": ["plan vote"],
  "app/api/reel-places/route.ts": ["reel place finder"],
  "app/waitlist/confirm/page.tsx": ["waitlist"],
  "lib/publicMap.ts": ["map pages"],
  "lib/requestBody.ts": ["Oracle", "waitlist", "reel place finder"],
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

function rateLimitParagraph(): string {
  const paragraph = renderToStaticMarkup(PrivacyPage())
    .split("</p>")
    .find((html) => html.includes("rate limit record keyed to your IP"));
  return (paragraph ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("privacy policy", () => {
  it("names every web feature that sends the visitor's IP to a rate limit", () => {
    const senders = sourceFiles(SRC)
      .filter((path) =>
        readFileSync(path, "utf8").includes("[WAITLIST_CLIENT_IP_HEADER]"),
      )
      .map((path) => relative(SRC, path))
      .sort();
    expect(senders).toEqual(Object.keys(RATE_LIMITED_FEATURES).sort());

    const paragraph = rateLimitParagraph();
    for (const feature of Object.values(RATE_LIMITED_FEATURES).flat()) {
      expect(paragraph).toContain(feature);
    }
  });
});
