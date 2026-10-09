/**
 * Verifies the identity token the native Sign in with Apple sheet returns.
 *
 * A token is trusted only when Apple's published keys signed it, it names
 * Apple as issuer and one of this deployment's bundle ids as audience, it has
 * not expired, and it answers the nonce this sign-in was started with.
 *
 * The app hands Apple the SHA-256 of a random value and sends the value
 * itself here. Apple copies what it was given into the `nonce` claim
 * unchanged, so the claim must equal the hash of the value received. A token
 * that leaks on its own cannot be replayed without the value behind it.
 */
import {
  createLocalJWKSet,
  errors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";

/** Bounded, so a rejection can be logged without any token content. */
type AppleIdTokenFailure =
  | "keys_unavailable"
  | "bad_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "expired"
  | "wrong_nonce"
  | "invalid";

export class AppleIdTokenError extends Error {
  constructor(readonly code: AppleIdTokenFailure) {
    super(`Apple identity token rejected: ${code}`);
    this.name = "AppleIdTokenError";
  }
}

type AppleKeySource = () => Promise<JSONWebKeySet>;

// ponytail: fetched on every sign-in, with no cache. Cache the set by its
// Cache-Control lifetime if sign-in volume ever makes the extra request matter.
const fetchAppleKeys: AppleKeySource = async () => {
  const response = await fetch(APPLE_KEYS_URL);
  if (!response.ok) throw new AppleIdTokenError("keys_unavailable");
  return (await response.json()) as JSONWebKeySet;
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function failureOf(error: unknown): AppleIdTokenFailure {
  if (error instanceof errors.JWTExpired) return "expired";
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === "iss") return "wrong_issuer";
    if (error.claim === "aud") return "wrong_audience";
    return "invalid";
  }
  if (
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JWKSNoMatchingKey
  )
    return "bad_signature";
  return "invalid";
}

/** Checks Apple's signature, issuer, audience and expiry, and nothing else. */
async function signedClaims(
  identityToken: string,
  audiences: string[],
  keys: AppleKeySource,
): Promise<JWTPayload & { sub: string }> {
  const keySet = createLocalJWKSet(await keys());
  const { payload } = await jwtVerify(identityToken, keySet, {
    issuer: APPLE_ISSUER,
    audience: audiences,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp"],
  }).catch((error: unknown) => {
    throw new AppleIdTokenError(failureOf(error));
  });
  if (typeof payload.sub !== "string" || payload.sub === "")
    throw new AppleIdTokenError("invalid");
  return { ...payload, sub: payload.sub };
}

/**
 * The Apple account an identity token from Apple's own token endpoint names.
 * That token answers a code exchange, not a sign-in the app started, so there
 * is no nonce of ours to hold it to; the signature and audience still are.
 */
export async function appleTokenSubject({
  identityToken,
  audience,
  keys = fetchAppleKeys,
}: {
  identityToken: string;
  audience: string;
  keys?: AppleKeySource;
}): Promise<string> {
  return (await signedClaims(identityToken, [audience], keys)).sub;
}

export async function verifyAppleIdToken({
  identityToken,
  nonce,
  audiences,
  keys = fetchAppleKeys,
}: {
  identityToken: string;
  /** The raw value whose SHA-256 the app gave Apple. */
  nonce: string;
  audiences: string[];
  keys?: AppleKeySource;
}): Promise<{ sub: string; audience: string; email?: string }> {
  const payload = await signedClaims(identityToken, audiences, keys);
  if (payload.nonce !== (await sha256Hex(nonce)))
    throw new AppleIdTokenError("wrong_nonce");
  // Apple sends `email_verified` as a boolean or the string "true". A new
  // account links to an existing user by email, so an unverified one is
  // dropped rather than trusted.
  const verified =
    payload.email_verified === true || payload.email_verified === "true";
  // jose has already required one of `audiences`; name the one it matched.
  const claimed = [payload.aud ?? []].flat();
  const audience = audiences.find((allowed) => claimed.includes(allowed));
  if (audience === undefined) throw new AppleIdTokenError("invalid");
  return {
    sub: payload.sub,
    audience,
    ...(verified && typeof payload.email === "string"
      ? { email: payload.email }
      : {}),
  };
}
