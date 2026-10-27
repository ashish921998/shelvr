export type UrlPolicyError =
  | "empty"
  | "invalid_url"
  | "unsupported_scheme"
  | "credentials_not_allowed"
  | "invalid_host"
  | "invalid_port"
  | "url_too_long";

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

export const MAX_URL_LENGTH = 2048;

class UrlPolicyErrorClass extends Error {
  constructor(
    public readonly code: UrlPolicyError,
    message: string,
  ) {
    super(message);
    this.name = "UrlPolicyError";
  }
}

export function isUrlPolicyError(e: unknown): e is UrlPolicyErrorClass {
  return e instanceof UrlPolicyErrorClass;
}

export function normalizeExternalUrl(raw: string): string {
  if (typeof raw !== "string") {
    throw new UrlPolicyErrorClass("invalid_url", "URL must be a string");
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new UrlPolicyErrorClass("empty", "URL is empty");
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);

  let parsed: URL;
  if (hasScheme) {
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new UrlPolicyErrorClass("invalid_host", "URL has no host");
    }
  } else {
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      throw new UrlPolicyErrorClass("invalid_url", "URL is not valid");
    }
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new UrlPolicyErrorClass(
      "unsupported_scheme",
      "Only http(s) URLs are allowed",
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new UrlPolicyErrorClass(
      "credentials_not_allowed",
      "Credentials are not allowed in URLs",
    );
  }
  if (parsed.hostname === "") {
    throw new UrlPolicyErrorClass("invalid_host", "URL has no host");
  }
  if (parsed.port !== "") {
    throw new UrlPolicyErrorClass(
      "invalid_port",
      "Non-default ports are not allowed",
    );
  }

  const canonical = parsed.href;
  if (canonical.length > MAX_URL_LENGTH) {
    throw new UrlPolicyErrorClass("url_too_long", "URL exceeds maximum length");
  }
  return canonical;
}

export function isTikTokUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "tiktok.com" || host.endsWith(".tiktok.com");
  } catch {
    return false;
  }
}

export function instagramMedia(
  url: string | undefined,
  base?: string,
): { kind: "reel" | "p" | "tv"; shortcode?: string } | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, base);
    const host = parsed.hostname.toLowerCase();
    if (
      host !== "instagram.com" &&
      host !== "www.instagram.com" &&
      host !== "m.instagram.com" &&
      host !== "instagr.am" &&
      host !== "www.instagr.am"
    ) {
      return undefined;
    }
    const match = parsed.pathname.match(
      /^\/(?:[A-Za-z0-9._]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]+)(?:\/.*)?$/,
    );
    if (!match || match[2] === "audio") return undefined;
    const kind =
      match[1] === "reels" ? "reel" : (match[1] as "reel" | "p" | "tv");
    return match[0].startsWith("/share/")
      ? { kind }
      : { kind, shortcode: match[2] };
  } catch {
    return undefined;
  }
}

export function isInstagramUrl(url: string | undefined): boolean {
  return instagramMedia(url) !== undefined;
}

export function shortFormSource(
  url: string | undefined,
): { site: "TikTok" | "Instagram"; video: boolean } | undefined {
  if (isTikTokUrl(url)) {
    return { site: "TikTok", video: true };
  }
  const media = instagramMedia(url);
  if (media) {
    return { site: "Instagram", video: media.kind !== "p" };
  }
  return undefined;
}

export function isXHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "x.com" ||
    host.endsWith(".x.com") ||
    host === "twitter.com" ||
    host.endsWith(".twitter.com")
  );
}

export function xStatusId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!isXHost(parsed.hostname)) {
      return undefined;
    }
    return parsed.pathname.match(
      /^\/(?:[^/]+|i\/web)\/status\/(\d+)(?:\/.*)?$/,
    )?.[1];
  } catch {
    return undefined;
  }
}

const PINTEREST_DOMAIN_SUFFIXES = new Set([
  "com",
  "at",
  "ca",
  "ch",
  "cl",
  "co.kr",
  "co.uk",
  "com.au",
  "com.mx",
  "de",
  "dk",
  "es",
  "fr",
  "ie",
  "it",
  "jp",
  "nz",
  "ph",
  "pt",
  "ru",
  "se",
]);

export function isPinterestHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "pin.it") {
    return true;
  }
  const suffix = host.match(/(?:^|\.)pinterest\.([a-z.]+)$/)?.[1];
  return suffix !== undefined && PINTEREST_DOMAIN_SUFFIXES.has(suffix);
}

export function pinterestPinId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!isPinterestHost(parsed.hostname)) {
      return undefined;
    }
    return parsed.pathname.match(/^\/pin\/(?:[^/]*--)?(\d+)(?:\/.*)?$/)?.[1];
  } catch {
    return undefined;
  }
}

export function isPinterestShortUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.toLowerCase() === "pin.it";
  } catch {
    return false;
  }
}

/** A Google Maps link: a maps.app.goo.gl share link, goo.gl/maps, or a google.<tld>/maps page
 * (google.com, google.de, google.co.uk or google.com.au; look-alikes such as google.evil.com are refused). */
export function isGoogleMapsUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "maps.app.goo.gl") return true;
    if (host === "goo.gl") return parsed.pathname.startsWith("/maps/");
    if (host === "maps.google.com") return true;
    return (
      /^(?:www\.)?google\.(?:com|cat|(?:com?\.)?[a-z]{2})$/.test(host) &&
      (parsed.pathname === "/maps" || parsed.pathname.startsWith("/maps/"))
    );
  } catch {
    return false;
  }
}

export type LinkSource = "tiktok" | "x" | "instagram" | "pinterest" | "youtube";

export function linkSource(url: string | undefined): LinkSource | undefined {
  if (isTikTokUrl(url)) return "tiktok";
  if (xStatusId(url) !== undefined) return "x";
  if (isInstagramUrl(url)) return "instagram";
  if (pinterestPinId(url) !== undefined || isPinterestShortUrl(url)) {
    return "pinterest";
  }
  if (isYouTubeUrl(url)) return "youtube";
  return undefined;
}

const YOUTUBE_HOSTS = new Set([
  "youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(normalizeExternalUrl(new URL(raw).href));
    if (!YOUTUBE_HOSTS.has(url.hostname)) return undefined;

    let candidate: string | null | undefined;
    if (url.hostname === "youtu.be") {
      candidate = url.pathname.slice(1);
    } else if (url.pathname === "/watch") {
      if (url.searchParams.getAll("v").length !== 1) return undefined;
      candidate = url.searchParams.get("v");
    } else {
      candidate = url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1];
    }
    return candidate && YOUTUBE_VIDEO_ID.test(candidate)
      ? candidate
      : undefined;
  } catch {
    return undefined;
  }
}

export function isYouTubeUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return YOUTUBE_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
