export type LibraryEntry = { url: string; title?: string; savedAt?: number };

export type LibraryStats = {
  count: number;
  oldestAt?: number;
  topDomains: string[];
};

export type LibraryRow = { label: string; domain: string; savedAt?: number };

type LibraryFormat = "netscape" | "instagram" | "lines";

const MAX_LABEL_CHARS = 200;

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function epochSecondsToMs(value: unknown): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function entry(url: string, title?: string, savedAt?: number): LibraryEntry {
  return {
    url,
    ...(title ? { title } : {}),
    ...(savedAt ? { savedAt } : {}),
  };
}

function parseNetscape(blob: string): LibraryEntry[] {
  return [...blob.matchAll(/<a\s([^>]*)>([\s\S]*?)<\/a>/gi)].flatMap(
    ([, attributes, inner]) => {
      const href = /href="([^"]*)"/i.exec(attributes)?.[1];
      const url = href && httpUrl(decodeEntities(href));
      if (!url) return [];
      const title = decodeEntities(inner.replace(/<[^>]*>/g, "")).trim();
      const addDate = /add_date="(\d+)"/i.exec(attributes)?.[1];
      return [entry(url, title, epochSecondsToMs(addDate))];
    },
  );
}

type InstagramSave = {
  title?: unknown;
  string_map_data?: { "Saved on"?: { href?: unknown; timestamp?: unknown } };
};

function parseInstagram(blob: string): LibraryEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(blob);
  } catch {
    return [];
  }
  const saves = (data as { saved_saved_media?: unknown })?.saved_saved_media;
  if (!Array.isArray(saves)) return [];
  return (saves as InstagramSave[]).flatMap((save) => {
    const savedOn = save?.string_map_data?.["Saved on"];
    const url = httpUrl(savedOn?.href);
    if (!url) return [];
    const title = typeof save.title === "string" ? save.title : undefined;
    return [entry(url, title, epochSecondsToMs(savedOn?.timestamp))];
  });
}

function parseLines(blob: string): LibraryEntry[] {
  return blob.split(/\r?\n/).flatMap((line) => {
    const url = httpUrl(line);
    return url ? [entry(url)] : [];
  });
}

const parsers: Record<LibraryFormat, (blob: string) => LibraryEntry[]> = {
  netscape: parseNetscape,
  instagram: parseInstagram,
  lines: parseLines,
};

function detectFormat(blob: string): LibraryFormat {
  if (/<a\s[^>]*href=/i.test(blob)) return "netscape";
  if (blob.trimStart().startsWith("{") && blob.includes("saved_saved_media")) {
    return "instagram";
  }
  return "lines";
}

/** Bookmarks HTML (Chrome, Safari, Firefox), Instagram's saved_posts.json,
 * or one URL per line. savedAt is epoch milliseconds. */
export function parseLibraryExport(blob: string): LibraryEntry[] {
  return parsers[detectFormat(blob)](blob);
}

function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

export function libraryStats(rows: LibraryEntry[]): LibraryStats {
  const perDomain = new Map<string, number>();
  let oldestAt: number | undefined;
  for (const row of rows) {
    const domain = domainOf(row.url);
    perDomain.set(domain, (perDomain.get(domain) ?? 0) + 1);
    if (row.savedAt && (oldestAt === undefined || row.savedAt < oldestAt)) {
      oldestAt = row.savedAt;
    }
  }
  const topDomains = [...perDomain]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([domain]) => domain);
  return {
    count: rows.length,
    ...(oldestAt === undefined ? {} : { oldestAt }),
    topDomains,
  };
}

/** An evenly spaced sample, so the oracle sees the whole span of the pile
 * rather than only its newest or oldest end. */
export function oracleRows(rows: LibraryEntry[], max = 40): LibraryRow[] {
  const step = Math.max(1, rows.length / max);
  return Array.from({ length: Math.min(max, rows.length) }, (_, i) => {
    const row = rows[Math.floor(i * step)];
    return {
      label: (row.title || row.url).slice(0, MAX_LABEL_CHARS),
      domain: domainOf(row.url),
      ...(row.savedAt ? { savedAt: row.savedAt } : {}),
    };
  });
}
