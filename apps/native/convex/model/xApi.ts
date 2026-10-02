// X API v2 helpers for automatic bookmark import (see xImport.ts). Web Crypto
// and fetch only, so this runs in the default Convex runtime. Everything that
// parses an X response treats the body as unknown and narrows it.

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_API_ORIGIN = "https://api.x.com";

/** `offline.access` is what makes X issue a refresh token, so syncs keep
 * working after the two-hour access token expires. */
export const X_SCOPES = [
  "tweet.read",
  "users.read",
  "bookmark.read",
  "offline.access",
] as const;

/** Path of the HTTP route X redirects back to after the user approves. It must
 * be registered as a callback URL on the X app, prefixed with the
 * deployment's site URL. */
export const X_CALLBACK_PATH = "/x/oauth/callback";

/** Where the callback sends the browser when it is done. `import` is a real
 * route, so on Android, where the redirect also reaches the router, it lands
 * on the import screen instead of an unmatched route. */
export const X_APP_RETURN_URL = "shelvr://import";

/** A random URL-safe secret: the OAuth `state` or the PKCE verifier. 32 bytes
 * gives a 43-character verifier, inside RFC 7636's 43 to 128 range. */
export function newOAuthSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** The S256 PKCE challenge for `verifier`. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

export function authorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(X_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", X_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type XTokens = {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry of the access token, in ms since the epoch. */
  accessTokenExpiresAt: number;
};

export function parseTokenResponse(
  body: unknown,
  now: number,
): XTokens | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const accessToken = record.access_token;
  const refreshToken = record.refresh_token;
  const expiresIn = record.expires_in;
  if (
    typeof accessToken !== "string" ||
    accessToken === "" ||
    typeof refreshToken !== "string" ||
    refreshToken === ""
  ) {
    return undefined;
  }
  // X documents two hours. Missing or odd values fall back to that.
  const seconds =
    typeof expiresIn === "number" && Number.isFinite(expiresIn)
      ? expiresIn
      : 7200;
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: now + seconds * 1000,
  };
}

/** The authenticated user's X id from `GET /2/users/me`. */
export function parseMeResponse(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const data = (body as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return undefined;
  const id = (data as Record<string, unknown>).id;
  return typeof id === "string" && /^\d+$/.test(id) ? id : undefined;
}

export type BookmarksPage = {
  /** Post ids, newest bookmark first, as X returns them. */
  postIds: string[];
  nextToken: string | undefined;
};

/** One page of `GET /2/users/:id/bookmarks`. A user with no bookmarks gets a
 * body with no `data` at all, which is an empty page, not an error. */
export function parseBookmarksPage(body: unknown): BookmarksPage | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const data = record.data ?? [];
  if (!Array.isArray(data)) return undefined;
  const postIds = data.flatMap((post: unknown) => {
    if (typeof post !== "object" || post === null) return [];
    const id = (post as Record<string, unknown>).id;
    return typeof id === "string" && /^\d+$/.test(id) ? [id] : [];
  });
  const meta = record.meta;
  const next =
    typeof meta === "object" && meta !== null
      ? (meta as Record<string, unknown>).next_token
      : undefined;
  return {
    postIds,
    nextToken: typeof next === "string" && next !== "" ? next : undefined,
  };
}

/** The saved URL for a bookmarked post. The same shape the archive import
 * builds, so a post imported either way is one save. The page reader resolves
 * the author from the id. */
export function bookmarkPostUrl(postId: string): string {
  return `https://x.com/i/web/status/${postId}`;
}

/** HTTP Basic credentials for X's confidential-client token endpoint. */
export function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
