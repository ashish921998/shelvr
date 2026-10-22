/** Constant-time compare via Web Crypto; `node:crypto` is unavailable in the default Convex runtime. */
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

export function constantTimeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

export async function secureCompare(
  expected: string,
  provided: string,
): Promise<boolean> {
  const key = await hmacKey();
  const [expectedDigest, providedDigest] = await Promise.all([
    hmac(key, expected),
    hmac(key, provided),
  ]);
  return constantTimeBytesEqual(expectedDigest, providedDigest);
}
