const TRACKING_PARAM =
  /^(utm_.*|igsh|igshid|si|fbclid|gclid|ref|is_from_webapp|sender_device|_r|_t)$/i;

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
