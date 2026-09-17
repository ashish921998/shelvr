/**
 * Syntactic URL normalization and policy for user-supplied link URLs.
 *
 * This module is runtime-agnostic: it has no Node-only imports, so it can be
 * used from Convex mutations (default V8 runtime) and from Node actions alike.
 * It validates only the *form* of a URL — scheme, host, port, credentials,
 * length. It does NOT resolve DNS or inspect the destination address; that is
 * the job of `safeFetch.ts` at request time, bound to the actual connection.
 *
 * Network destination safety (private/reserved IP ranges, DNS answers) lives in
 * `safeFetch.ts` because it requires Node-only libraries.
 */

/** Policy error categories. Stable codes used by callers and logs; never the
 * internal parser text or the offending URL. */
export type UrlPolicyError =
  | "empty"
  | "invalid_url"
  | "unsupported_scheme"
  | "credentials_not_allowed"
  | "invalid_host"
  | "invalid_port"
  | "url_too_long";

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/** Hard cap on normalized URL length in UTF-16 code units (string `.length`).
 * Generous for real links, bounded to deny pathological input. */
export const MAX_URL_LENGTH = 2048;

export class UrlPolicyErrorClass extends Error {
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

/**
 * Normalize and policy-check a user-supplied link string.
 *
 * - trims input and prepends `https://` only when no scheme is present;
 * - parses with `new URL`;
 * - accepts only `http:` and `https:`;
 * - rejects username/password, empty hostname, invalid ports, and any explicit
 *   non-default port (e.g. `:8080`); explicit default ports (`http://…:80`,
 *   `https://…:443`) are dropped by the URL serializer's canonical form and are
 *   accepted;
 * - rejects URLs longer than {@link MAX_URL_LENGTH} UTF-16 code units after
 *   normalization;
 * - normalizes to the URL serializer's canonical string.
 *
 * Scheme detection is scheme-aware, not a `://` substring test: the input is
 * parsed as-is first, so single-colon schemes (`javascript:`, `data:`,
 * `localhost:3000`) are recognized as having a scheme and rejected as
 * unsupported rather than mis-prefixed.
 *
 * @returns the canonical URL string on success.
 * @throws {UrlPolicyErrorClass} with a stable code on any policy violation.
 */
export function normalizeExternalUrl(raw: string): string {
  if (typeof raw !== "string") {
    throw new UrlPolicyErrorClass("invalid_url", "URL must be a string");
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new UrlPolicyErrorClass("empty", "URL is empty");
  }

  // Decide whether the input already carries a scheme. A scheme is the leading
  // "<name>:" token; we detect it explicitly so that schemeless input (e.g.
  // "example.com") gets https:// prepended, while an explicit scheme is honored
  // and rejected as unsupported if it isn't http(s). Detecting the scheme up
  // front (rather than blindly retrying with an https:// prefix after a parse
  // failure) prevents "https://" alone from being rescued into a bogus host.
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);

  let parsed: URL;
  if (hasScheme) {
    // Input has a scheme — parse as-is so we can report its real scheme.
    try {
      parsed = new URL(trimmed);
    } catch {
      // Parsed-here-but-bad (e.g. "https://" with no host): the input declared
      // an http(s)-style scheme but is not a complete URL.
      throw new UrlPolicyErrorClass("invalid_host", "URL has no host");
    }
  } else {
    // Schemeless — prepend https:// and parse the canonical form.
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
  // The URL serializer exposes username/password via these getters even when
  // absent from the original string for some hosts; check the raw userInfo part.
  if (parsed.username !== "" || parsed.password !== "") {
    throw new UrlPolicyErrorClass(
      "credentials_not_allowed",
      "Credentials are not allowed in URLs",
    );
  }
  if (parsed.hostname === "") {
    throw new UrlPolicyErrorClass("invalid_host", "URL has no host");
  }
  // An explicit non-default port survives in parsed.port (the URL serializer
  // strips only the *default* port for the scheme). Any remaining port is
  // non-default and is rejected — we only ever fetch standard web endpoints.
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

/** True for a TikTok video link (any subdomain, including the `vm`/`vt` short
 * hosts). Shared by the pipeline (oEmbed instead of a page fetch — TikTok
 * refuses bot page loads) and the client (video card/detail treatment). */
export function isTikTokUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "tiktok.com" || host.endsWith(".tiktok.com");
  } catch {
    return false;
  }
}

/** An Instagram post, reel, or IGTV link reduced to its media kind and
 * shortcode. Accepts instagram.com with or without the www/m subdomain, the
 * instagr.am short host, the `/reels/` alias, and the `/{user}/reel/{id}`
 * shape Instagram serves after a share. A `/share/{kind}/{token}` link names
 * the kind but carries a redirect token, not a shortcode, so its shortcode is
 * left for the caller to resolve from the redirect. Profiles, stories, and
 * look-alike hosts are not media links. A relative `url` resolves against
 * `base`. */
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
    // `/reels/audio/{id}` is a sound page, not a reel.
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

/** True for an Instagram post, reel, or IGTV link. */
export function isInstagramUrl(url: string | undefined): boolean {
  return instagramMedia(url) !== undefined;
}

/** Short-form social links whose saved content is a caption, not an article:
 * TikTok videos and Instagram media. `video` is true for TikTok and for
 * Instagram reels and IGTV; an Instagram `/p/` link may be a photo. The
 * pipeline and the client share this so both treat these links the same way. */
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

/** True for an X / Twitter post URL, the only shape X's oEmbed endpoint
 * accepts: `x.com/{user}/status/{id}` and the `x.com/i/web/status/{id}` path
 * the import screen builds from archive bookmark ids. Profiles, lists, and
 * `t.co` short links are not posts and go through the normal page reader. */
export function isXTweetUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      host !== "x.com" &&
      !host.endsWith(".x.com") &&
      host !== "twitter.com" &&
      !host.endsWith(".twitter.com")
    ) {
      return false;
    }
    // The id must be a whole path segment, optionally followed by more
    // segments such as /photo/1, so /status/123abc is rejected.
    return /^\/(?:[^/]+|i\/web)\/status\/\d+(?:\/.*)?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}
