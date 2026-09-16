/**
 * Pairing codes and connection tokens for the browser extension.
 *
 * The extension cannot run Convex Auth's OAuth flow — there is no signed-in
 * web surface to redirect through (apps/web is a marketing site with no auth),
 * and a browser extension has no Apple/Google sign-in sheet. So the signed-in
 * app is the one that proves identity: it mints a short, single-use pairing
 * code, the user types it into the extension, and the extension trades it for
 * a long-lived bearer token scoped to that one browser.
 *
 * Neither secret is ever stored in plaintext. The tables hold SHA-256 hashes
 * only, so a database read hands out nothing that can be replayed; lookups go
 * through the hash, which is what the indexes are keyed on.
 *
 * This module is runtime-agnostic (no Convex server imports) so it can be used
 * from HTTP actions, from plain actions, and from tests alike. Everything here
 * is pure apart from the two generators, which draw from `crypto`.
 */

/**
 * Crockford Base32: the digits and uppercase letters minus `I`, `L`, `O` and
 * `U`. A user reads this code off a phone screen and types it into a browser,
 * so the alphabet has no character pairs that look alike in either place, and
 * no vowels to spell an unfortunate word. Exactly 32 symbols, so five random
 * bits map onto one character with no modulo bias.
 */
export const PAIRING_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Characters per code. 32^8 = 2^40 possibilities, which — with the global
 * limiter on the pairing route — puts a blind guess far out of reach for a
 * code that only lives ten minutes. */
export const PAIRING_CODE_LENGTH = 8;

/** How long a displayed code stays redeemable. Long enough to walk from phone
 * to laptop, short enough that an abandoned code on a screen is inert by the
 * time anyone else reads it. */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

/** Prefix on every connection token, so a leaked string is recognizable as a
 * Shelvr credential (by a secret scanner, or by us in a bug report) rather
 * than anonymous base64. */
export const CONNECTION_TOKEN_PREFIX = "shx_";

/** Entropy behind a connection token. 256 bits: this is the standing
 * credential, not a ten-minute one. */
const CONNECTION_TOKEN_BYTES = 32;

/** Longest browser label we store. The extension proposes it (e.g. "Chrome on
 * macOS") and the user sees it in the app's connected-browsers list, so it is
 * display copy, not an identifier — bounded rather than validated. */
export const MAX_CONNECTION_LABEL_LENGTH = 40;

/** Shown when the extension sends no usable label. */
export const DEFAULT_CONNECTION_LABEL = "Browser";

const HEX = "0123456789abcdef";

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += HEX[byte >> 4]! + HEX[byte & 0x0f]!;
  }
  return out;
}

/**
 * A fresh pairing code in the canonical alphabet, unformatted.
 *
 * Each character takes the low five bits of one random byte. The alphabet is
 * exactly 32 symbols, so masking is uniform — unlike `% alphabet.length` on a
 * 256-value byte, which would quietly favour the first symbols.
 */
export function generatePairingCode(): string {
  const bytes = new Uint8Array(PAIRING_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += PAIRING_CODE_ALPHABET[byte & 0x1f]!;
  }
  return code;
}

/** `ABCD-EFGH` — the display form. Grouping makes the code easier to read
 * aloud and to retype; {@link normalizePairingCode} accepts it either way. */
export function formatPairingCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

/**
 * Canonicalize what the user typed, or null if it cannot be a code.
 *
 * Separators and case are noise: the display form has a dash, people type
 * spaces, and browsers helpfully lowercase autofill. The three excluded
 * lookalikes are folded onto the symbol they resemble (Crockford's rule), so
 * someone who reads `0` as `O` still pairs on the first try.
 */
export function normalizePairingCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (cleaned.length !== PAIRING_CODE_LENGTH) return null;
  for (const char of cleaned) {
    if (!PAIRING_CODE_ALPHABET.includes(char)) return null;
  }
  return cleaned;
}

/** A fresh connection token: the prefix plus 256 bits of base64url. Returned
 * to the extension once, at pairing; only its hash is ever stored. */
export function generateConnectionToken(): string {
  const bytes = new Uint8Array(CONNECTION_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64url = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${CONNECTION_TOKEN_PREFIX}${base64url}`;
}

/**
 * SHA-256 of a secret, lowercase hex — the only form either secret is stored
 * or looked up in.
 *
 * A plain hash (no salt, no stretching) is the right primitive here and not a
 * password shortcut: both inputs are full-entropy random strings we generated,
 * so there is no guessable preimage for a rainbow table or a brute-force pass
 * to find. Salting would only break the index lookup this exists to serve.
 */
export async function hashSecret(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toHex(new Uint8Array(digest));
}

/**
 * Bound and tidy an extension-supplied browser label. Control characters are
 * dropped and runs of whitespace collapsed so the connected-browsers list
 * cannot be made to render a blank row or a wall of text; anything left empty
 * falls back to {@link DEFAULT_CONNECTION_LABEL}.
 */
export function sanitizeConnectionLabel(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_CONNECTION_LABEL;
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned === "") return DEFAULT_CONNECTION_LABEL;
  return cleaned.slice(0, MAX_CONNECTION_LABEL_LENGTH).trim();
}

/** The bearer token carried by an `Authorization` header, or null when the
 * header is absent or not a bearer credential. Case-insensitive on the scheme,
 * as RFC 7235 requires. */
export function bearerToken(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match === null ? null : match[1]!;
}
