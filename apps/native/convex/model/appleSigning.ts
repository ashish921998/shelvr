/**
 * ES256 JWTs signed with an Apple .p8 key, shared by the Sign in with Apple
 * client secret and the retention offer signature. WebCrypto's ECDSA
 * signature is already the raw r||s form a JWT wants. Runtime-neutral.
 */

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export async function signEs256Jwt(
  privateKey: string,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const der = Uint8Array.from(
    atob(
      privateKey
        // An env var pasted on one line carries its newlines as "\n".
        .replace(/\\n/g, "")
        .replace(/-----[A-Z ]+-----/g, "")
        .replace(/\s+/g, ""),
    ),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signed = `${encodeJson({ alg: "ES256", ...header })}.${encodeJson(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signed),
  );
  return `${signed}.${base64Url(new Uint8Array(signature))}`;
}
