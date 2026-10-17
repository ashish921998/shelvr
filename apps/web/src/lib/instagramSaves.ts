export type SavedPostKind = "post" | "reel" | "video";

export type SavedPost = {
  url: string;
  kind: SavedPostKind;
  author?: string;
  savedAt?: number;
  collections: string[];
};

type SavesSummary = {
  count: number;
  accounts: number;
  reels: number;
  oldestAt?: number;
  topAccounts: { author: string; count: number }[];
  collections: { name: string; count: number }[];
};

// Instagram's data download names the files after what they hold; a zip may
// carry them under any folder, so only the file name is matched.
const SAVED_FILES = /(^|\/)saved_(posts|collections)\.(json|html?)$/i;

const MIN_SAVED_AT = Date.UTC(2010, 0, 1);
const MAX_SAVED_AT = Date.UTC(2100, 0, 1);
const MAX_DEPTH = 6;

/** Canonical form of an Instagram post link, or undefined for anything else. */
export function postUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (!/^(www\.)?instagram\.com$/i.test(url.hostname)) return undefined;
  const match = /^\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/.exec(url.pathname);
  if (!match) return undefined;
  const [, segment, code] = match;
  const path = segment === "p" ? "p" : segment === "tv" ? "tv" : "reel";
  return `https://www.instagram.com/${path}/${code}/`;
}

function kindOf(url: string): SavedPostKind {
  if (url.includes("/reel/")) return "reel";
  if (url.includes("/tv/")) return "video";
  return "post";
}

function savedAtFrom(value: unknown): number | undefined {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const ms = seconds * 1000;
  return ms >= MIN_SAVED_AT && ms <= MAX_SAVED_AT ? ms : undefined;
}

/** Meta writes UTF-8 bytes as Latin-1 escapes ("cafÃ©" for "café"). */
export function fixMojibake(text: string): string {
  if (!/[À-ÿ]/.test(text) || /[^\u0000-ÿ]/.test(text)) {
    return text;
  }
  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

type Found = { url?: string; savedAt?: number; name?: string };

/** The first post link, timestamp and display name anywhere inside one
 * exported record. Meta has shipped both `string_map_data` and
 * `label_values` shapes, so the record is searched rather than addressed. */
function scan(node: unknown, found: Found, depth = 0): Found {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") {
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) scan(child, found, depth + 1);
    return found;
  }
  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (!found.url && (key === "href" || key === "value")) {
      found.url = postUrl(value);
    }
    if (!found.savedAt && key === "timestamp") {
      found.savedAt = savedAtFrom(value);
    }
    if (
      !found.name &&
      key === "value" &&
      typeof value === "string" &&
      !postUrl(value) &&
      /^(name|username|author|owner)$/i.test(String(record.label ?? ""))
    ) {
      found.name = value;
    }
    if (typeof value === "object") scan(value, found, depth + 1);
  }
  const nameField = (record.Name as { value?: unknown } | undefined)?.value;
  if (!found.name && typeof nameField === "string" && !postUrl(nameField)) {
    found.name = nameField;
  }
  return found;
}

function displayName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = fixMojibake(value.trim());
  return name || undefined;
}

function records(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    return Object.values(data).flatMap((value) =>
      Array.isArray(value) ? value : [],
    );
  }
  return [];
}

/** saved_posts.json or saved_collections.json. In the collections file a
 * record without a post link names the collection the records after it
 * belong to. */
function parseSavesJson(text: string, isCollections: boolean): SavedPost[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  let collection: string | undefined;
  return records(data).flatMap((record): SavedPost[] => {
    if (!record || typeof record !== "object") return [];
    const found = scan(record, {});
    const title = (record as { title?: unknown }).title;
    if (!found.url) {
      if (isCollections) collection = displayName(found.name ?? title);
      return [];
    }
    const author = displayName(title) ?? displayName(found.name);
    return [
      {
        url: found.url,
        kind: kindOf(found.url),
        ...(author && author !== "Collection" ? { author } : {}),
        ...(found.savedAt ? { savedAt: found.savedAt } : {}),
        collections: collection ? [collection] : [],
      },
    ];
  });
}

/** The HTML flavour of the download carries the links but no reliable
 * author or date markup, so only the links are kept. */
function parseSavesHtml(text: string): SavedPost[] {
  return [...text.matchAll(/href="([^"]+)"/gi)].flatMap(([, href]) => {
    const url = postUrl(href.replace(/&amp;/g, "&"));
    return url ? [{ url, kind: kindOf(url), collections: [] }] : [];
  });
}

export function parseSavesFile(name: string, text: string): SavedPost[] {
  return /\.html?$/i.test(name) || text.trimStart().startsWith("<")
    ? parseSavesHtml(text)
    : parseSavesJson(text, /saved_collections\./i.test(name));
}

/** One row per post, newest first. A post found in several files keeps the
 * first file's details (pass saved_posts first: its date is when the post
 * was saved, not when it was filed) and every collection it was filed in. */
export function mergeSaves(lists: SavedPost[][]): SavedPost[] {
  const byUrl = new Map<string, SavedPost>();
  for (const save of lists.flat()) {
    const seen = byUrl.get(save.url);
    if (!seen) {
      byUrl.set(save.url, { ...save, collections: [...save.collections] });
      continue;
    }
    seen.author ??= save.author;
    seen.savedAt ??= save.savedAt;
    for (const name of save.collections) {
      if (!seen.collections.includes(name)) seen.collections.push(name);
    }
  }
  return [...byUrl.values()].sort(
    (a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0),
  );
}

function ranked(counts: Map<string, number>, max: number) {
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max);
}

export function summarize(saves: SavedPost[]): SavesSummary {
  const perAuthor = new Map<string, number>();
  const perCollection = new Map<string, number>();
  let oldestAt: number | undefined;
  let reels = 0;
  for (const save of saves) {
    if (save.author) {
      perAuthor.set(save.author, (perAuthor.get(save.author) ?? 0) + 1);
    }
    for (const name of save.collections) {
      perCollection.set(name, (perCollection.get(name) ?? 0) + 1);
    }
    if (save.kind === "reel") reels += 1;
    if (save.savedAt && (oldestAt === undefined || save.savedAt < oldestAt)) {
      oldestAt = save.savedAt;
    }
  }
  return {
    count: saves.length,
    accounts: perAuthor.size,
    reels,
    ...(oldestAt === undefined ? {} : { oldestAt }),
    topAccounts: ranked(perAuthor, 8).map(([author, count]) => ({
      author,
      count,
    })),
    collections: ranked(perCollection, 12).map(([name, count]) => ({
      name,
      count,
    })),
  };
}

export function matchesQuery(save: SavedPost, query: string): boolean {
  const needle = query.trim().toLowerCase().replace(/^@/, "");
  if (!needle) return true;
  // The link is left out: every link shares "instagram.com/p/", so a short
  // query would match all of them.
  return [save.author ?? "", ...save.collections].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

function csvCell(value: string): string {
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(saves: SavedPost[]): string {
  const rows = saves.map((save) =>
    [
      save.author ?? "",
      save.kind,
      save.savedAt ? new Date(save.savedAt).toISOString().slice(0, 10) : "",
      save.collections.join("; "),
      save.url,
    ]
      .map(csvCell)
      .join(","),
  );
  return ["account,type,saved_on,collections,link", ...rows].join("\r\n");
}

// --- Zip reading -----------------------------------------------------------
// The download arrives as a zip. Reading only the central directory and the
// one or two saved_* entries keeps a large archive (photos included) cheap,
// and nothing leaves the browser.

export type ZipSource = {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
};

function fileSource(file: Blob): ZipSource {
  return {
    size: file.size,
    read: async (start, end) =>
      new Uint8Array(await file.slice(start, end).arrayBuffer()),
  };
}

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
};

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const MAX_U32 = 0xffffffff;

function u64(view: DataView, at: number): number {
  return view.getUint32(at, true) + view.getUint32(at + 4, true) * 2 ** 32;
}

async function centralDirectory(source: ZipSource) {
  const tailStart = Math.max(0, source.size - 65_557);
  const tail = await source.read(tailStart, source.size);
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  for (let at = tail.length - 22; at >= 0; at -= 1) {
    if (view.getUint32(at, true) !== EOCD) continue;
    let size = view.getUint32(at + 12, true);
    let offset = view.getUint32(at + 16, true);
    if (
      (size === MAX_U32 || offset === MAX_U32) &&
      at >= 20 &&
      view.getUint32(at - 20, true) === ZIP64_LOCATOR
    ) {
      const recordAt = u64(view, at - 12);
      const record = await source.read(recordAt, recordAt + 56);
      const zip64 = new DataView(record.buffer, record.byteOffset, 56);
      size = u64(zip64, 40);
      offset = u64(zip64, 48);
    }
    return { size, offset };
  }
  return undefined;
}

function zip64Extra(
  view: DataView,
  start: number,
  end: number,
  needs: { compressed: boolean; offset: boolean; uncompressed: boolean },
) {
  for (let at = start; at + 4 <= end; ) {
    const id = view.getUint16(at, true);
    const length = view.getUint16(at + 2, true);
    if (id === 0x0001) {
      let field = at + 4;
      const values: { compressedSize?: number; offset?: number } = {};
      if (needs.uncompressed) field += 8;
      if (needs.compressed) {
        values.compressedSize = u64(view, field);
        field += 8;
      }
      if (needs.offset) values.offset = u64(view, field);
      return values;
    }
    at += 4 + length;
  }
  return {};
}

async function zipEntries(source: ZipSource): Promise<ZipEntry[]> {
  const directory = await centralDirectory(source);
  if (!directory) return [];
  const bytes = await source.read(
    directory.offset,
    directory.offset + directory.size,
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let at = 0; at + 46 <= bytes.length; ) {
    if (view.getUint32(at, true) !== CENTRAL) break;
    const method = view.getUint16(at + 10, true);
    let compressedSize = view.getUint32(at + 20, true);
    const uncompressedSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    let offset = view.getUint32(at + 42, true);
    const nameStart = at + 46;
    const name = decoder.decode(
      bytes.subarray(nameStart, nameStart + nameLength),
    );
    if (compressedSize === MAX_U32 || offset === MAX_U32) {
      const wide = zip64Extra(
        view,
        nameStart + nameLength,
        nameStart + nameLength + extraLength,
        {
          uncompressed: uncompressedSize === MAX_U32,
          compressed: compressedSize === MAX_U32,
          offset: offset === MAX_U32,
        },
      );
      compressedSize = wide.compressedSize ?? compressedSize;
      offset = wide.offset ?? offset;
    }
    entries.push({ name, method, compressedSize, offset });
    at = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function entryText(source: ZipSource, entry: ZipEntry): Promise<string> {
  const header = await source.read(entry.offset, entry.offset + 30);
  const view = new DataView(header.buffer, header.byteOffset, 30);
  const dataStart =
    entry.offset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
  const raw = await source.read(dataStart, dataStart + entry.compressedSize);
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error("unsupported_compression");
  }
  const bytes = entry.method === 8 ? await inflate(raw) : raw;
  return new TextDecoder().decode(bytes);
}

/** The saved_posts / saved_collections files inside a data download zip. */
export async function savedFilesInZip(
  source: ZipSource,
): Promise<{ name: string; text: string }[]> {
  const wanted = (await zipEntries(source)).filter((entry) =>
    SAVED_FILES.test(entry.name),
  );
  return Promise.all(
    wanted.map(async (entry) => ({
      name: entry.name,
      text: await entryText(source, entry),
    })),
  );
}

export function isZip(head: Uint8Array): boolean {
  return head[0] === 0x50 && head[1] === 0x4b;
}

export type ReadResult =
  | { ok: true; saves: SavedPost[]; format: "zip" | "json" | "html" }
  | {
      ok: false;
      reason:
        | "no_saves"
        | "no_saved_files"
        | "too_large"
        | "unreadable"
        | "old_browser";
    };

// A loose saved_posts.json is a few MB even for heavy savers; anything far
// larger is not that file and would only freeze a phone.
const MAX_LOOSE_FILE_BYTES = 50 * 1024 * 1024;

function postsFirst(name: string): number {
  return /saved_posts\./i.test(name) ? 0 : 1;
}

/** Every save in the files a visitor picked: the download zip, or the
 * saved_posts / saved_collections files taken out of it. */
export async function readSaves(files: File[]): Promise<ReadResult> {
  try {
    const found: { name: string; text: string }[] = [];
    let format: "zip" | "json" | "html" = "json";
    for (const file of files) {
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (isZip(head)) {
        // Unzipping needs DecompressionStream (Safari 16.4+); an older
        // browser can still open the loose saved_posts.json.
        if (typeof DecompressionStream === "undefined") {
          return { ok: false, reason: "old_browser" };
        }
        format = "zip";
        found.push(...(await savedFilesInZip(fileSource(file))));
      } else if (file.size > MAX_LOOSE_FILE_BYTES) {
        return { ok: false, reason: "too_large" };
      } else {
        if (/\.html?$/i.test(file.name)) format = "html";
        found.push({ name: file.name, text: await file.text() });
      }
    }
    if (format === "zip" && found.length === 0) {
      return { ok: false, reason: "no_saved_files" };
    }
    const saves = mergeSaves(
      [...found]
        .sort((a, b) => postsFirst(a.name) - postsFirst(b.name))
        .map((file) => parseSavesFile(file.name, file.text)),
    );
    return saves.length > 0
      ? { ok: true, saves, format }
      : { ok: false, reason: "no_saves" };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
