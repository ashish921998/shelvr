// Share and campaign parameters: they say who sent a link, not which page.
const TRACKING_PARAM =
  /^(utm_.*|igsh|igshid|si|fbclid|gclid|ref|is_from_webapp|sender_device|_r|_t)$/i;

/** A URL reduced to what names the page: host without `www.`, path without a
 * trailing slash, and the query minus share tracking (so `watch?v=` keeps
 * telling two videos apart). No scheme or fragment. */
function pageKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    const query = [...parsed.searchParams]
      .filter(([name]) => !TRACKING_PARAM.test(name))
      .map(([name, value]) => `${name}=${value}`)
      .sort()
      .join("&");
    return query ? `${host}${path}?${query}` : `${host}${path}`;
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
