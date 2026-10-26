import {
  createLocalJWKSet,
  errors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from "jose";
import { sha256Hex } from "./captureTokens";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";

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

const fetchAppleKeys: AppleKeySource = async () => {
  const response = await fetch(APPLE_KEYS_URL);
  if (!response.ok) throw new AppleIdTokenError("keys_unavailable");
  return (await response.json()) as JSONWebKeySet;
};

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
  nonce: string;
  audiences: string[];
  keys?: AppleKeySource;
}): Promise<{ sub: string; audience: string; email?: string }> {
  const payload = await signedClaims(identityToken, audiences, keys);
  if (payload.nonce !== (await sha256Hex(nonce)))
    throw new AppleIdTokenError("wrong_nonce");
  const verified =
    payload.email_verified === true || payload.email_verified === "true";
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
