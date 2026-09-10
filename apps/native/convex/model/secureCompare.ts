/**
 * Constant-time string comparison for shared secrets (webhook bearer tokens,
 * server-to-server headers).
 *
 * `a !== b` short-circuits on the first differing byte, so response timing
 * leaks how many leading bytes of a guess were right. This file runs in the
 * default Convex V8 runtime (no `"use node"`), where `node:crypto` and its
 * `timingSafeEqual` are unavailable, so it uses Web Crypto instead: both
 * inputs are HMAC'd with a fresh random key and the fixed-length digests are
 * compared with a loop that never exits early. The random key means even the
 * digest comparison cannot be steered by an attacker's choice of input, and
 * the fixed digest length means differing input lengths do not change the
 * amount of work done.
 */
const encoder = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmac(key: CryptoKey, value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

/**
 * Compare two equal-length byte arrays without an early exit. Returns false
 * for arrays of different lengths; callers that want to hide the length must
 * hash first (see `secureCompare`). Exported for direct testing.
 */
export function constantTimeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

/**
 * True when `expected` and `provided` are byte-for-byte identical. Timing does
 * not depend on where (or whether) the two strings differ, nor on the length
 * of `provided`. Either argument may be empty; an empty `expected` never
 * matches a non-empty `provided`.
 */
export async function secureCompare(
  expected: string,
  provided: string,
): Promise<boolean> {
  const key = await hmacKey();
  const [expectedDigest, providedDigest] = await Promise.all([
    hmac(key, expected),
    hmac(key, provided),
  ]);
  // Both digests are always 32 bytes, so the loop below does the same work
  // whatever the caller sent, and the random key means the caller cannot
  // predict (or influence) which digest bytes will differ.
  return constantTimeBytesEqual(expectedDigest, providedDigest);
}
