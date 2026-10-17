import type { SavedPost, SavedPostKind } from "./instagramSaves";

// Made-up saves for "Try a sample", so a visitor without their download yet
// can see what the tool shows. The links are placeholders and never shown
// as links.
const SAMPLE: [string, SavedPostKind, string, string?][] = [
  ["weeknight.kitchen", "reel", "2026-10-02", "Recipes"],
  ["lisbon.eats", "post", "2026-09-28", "Lisbon trip"],
  ["weeknight.kitchen", "reel", "2026-09-21", "Recipes"],
  ["small.flat.ideas", "post", "2026-09-14", "Home"],
  ["trail.notes", "reel", "2026-09-03"],
  ["lisbon.eats", "post", "2026-08-30", "Lisbon trip"],
  ["thrift.finds.daily", "post", "2026-08-19"],
  ["weeknight.kitchen", "reel", "2026-08-11", "Recipes"],
  ["small.flat.ideas", "reel", "2026-07-25", "Home"],
  ["pasta.by.nonna", "reel", "2026-07-02", "Recipes"],
  ["trail.notes", "post", "2026-06-17"],
  ["lisbon.eats", "reel", "2026-05-09", "Lisbon trip"],
  ["thrift.finds.daily", "reel", "2026-03-30"],
  ["pasta.by.nonna", "post", "2025-12-12", "Recipes"],
  ["desk.setups", "post", "2025-08-04"],
  ["weeknight.kitchen", "post", "2024-11-20", "Recipes"],
];

export function sampleSaves(): SavedPost[] {
  return SAMPLE.map(([author, kind, day, collection], i) => ({
    url: `https://www.instagram.com/${kind === "reel" ? "reel" : "p"}/sample${i}/`,
    kind,
    author,
    savedAt: Date.parse(`${day}T12:00:00Z`),
    collections: collection ? [collection] : [],
  }));
}
