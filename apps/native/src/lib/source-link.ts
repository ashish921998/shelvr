/** A URL reduced to what names the page: host without `www.`, path without a
 * trailing slash, no scheme, query or fragment. */
function pageKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

/**
 * Drops an "open" action that only reopens the save's own page. The page
 * already names its source in a tappable line (and a post's poster opens it),
 * so the model's "Open on Instagram" chip said the same thing twice.
 */
export function withoutSourceLink<T extends { kind: string; value: string }>(
  intents: T[],
  sourceUrl: string | undefined,
): T[] {
  const source = sourceUrl ? pageKey(sourceUrl) : null;
  if (!source) return intents;
  return intents.filter(
    (intent) => intent.kind !== "open_url" || pageKey(intent.value) !== source,
  );
}
