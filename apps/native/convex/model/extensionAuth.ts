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
 * Neither secret is ever stored in plaintext; the tables hold digests only,
 * and lookups go through the digest, which is what the indexes are keyed on.
 * The two get different treatment, because they have different entropy. A
 * connection token is 256 random bits, so a plain SHA-256 of it is already
 * beyond reach. A pairing code is 40 bits — short enough to type, and short
 * enough to brute-force offline against an unkeyed digest — so it is HMAC'd
 * under a deployment secret that never lands in a row. See
 * {@link hashPairingCode}.
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
 * SHA-256 of a connection token, lowercase hex — the form tokens are stored
 * and looked up in.
 *
 * A plain hash (no salt, no stretching) is the right primitive for *this*
 * input and not a password shortcut: a connection token is 256 random bits we
 * generated, so no rainbow table or brute-force pass can find its preimage,
 * and salting would only break the index lookup this exists to serve.
 *
 * A pairing code is a different animal — 40 bits, short enough to type — and
 * must not come through here. {@link hashPairingCode} keys it instead.
 */
export async function hashSecret(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toHex(new Uint8Array(digest));
}

/**
 * HMAC-SHA-256 of a pairing code under the deployment secret, lowercase hex.
 *
 * The code is eight characters so a person can read it off a phone and type it
 * into a browser, which caps it at 2^40 — and 2^40 unkeyed SHA-256 is minutes
 * of commodity GPU work, well inside the code's ten-minute life. An unkeyed
 * digest therefore protects the code only against someone who cannot compute,
 * which is nobody: anyone who reads `extensionPairings` could recover the
 * plaintext offline and redeem it once, without ever touching the redemption
 * limiter that guards online guessing.
 *
 * Keying the digest removes that. The secret lives in the deployment
 * environment and never in a row, so a database read — a leaked backup, a
 * snapshot, a dashboard session — yields hashes that cannot be searched
 * without also stealing the key from somewhere else entirely.
 *
 * Raising the entropy instead would not work: surviving ten minutes against an
 * ASIC farm needs upwards of 70 bits, or fourteen typed characters, which
 * gives up the thing the short code exists for.
 */
export async function hashPairingCode(
  code: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(code));
  return toHex(new Uint8Array(signature));
}

/**
 * The deployment's pairing-code key, or `null` when it is unset.
 *
 * Read through a function rather than captured at module load so a test can
 * set it per case, and so a deployment that adds the variable does not need a
 * cold start to pick it up.
 */
export function pairingCodeSecret(): string | null {
  const secret = process.env.EXTENSION_PAIRING_SECRET;
  return secret === undefined || secret === "" ? null : secret;
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
  // By code point, not by `slice`: `slice` counts UTF-16 code units, so a label
  // whose emoji straddles the limit would be cut between the two halves of a
  // surrogate pair. Convex stores strings as valid Unicode and rejects a lone
  // surrogate, so that truncation would fail the insert and break pairing for
  // whatever label the extension sent.
  return Array.from(cleaned)
    .slice(0, MAX_CONNECTION_LABEL_LENGTH)
    .join("")
    .trim();
}

/** The bearer token carried by an `Authorization` header, or null when the
 * header is absent or not a bearer credential. Case-insensitive on the scheme,
 * as RFC 7235 requires. */
export function bearerToken(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match === null ? null : match[1]!;
}
