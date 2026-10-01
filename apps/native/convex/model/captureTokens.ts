// Capture-token helpers shared by appIntents.ts and the HTTP routes. Web
// Crypto only (no Node builtins), so this runs in the default Convex runtime.

/** Longest raw token accepted from a client. Issued tokens are 64 chars. */
export const MAX_CAPTURE_TOKEN_LENGTH = 256;

/** A fresh capture token: 32 random bytes, hex encoded. */
export function newCaptureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** Hex-encoded SHA-256 of a UTF-8 string. Only this hash is stored. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toHex(new Uint8Array(digest));
}

/** The capture token in `Authorization: Bearer <token>`, or undefined. */
export function bearerToken(header: string | null): string | undefined {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  const token = match?.[1];
  return token !== undefined && token.length <= MAX_CAPTURE_TOKEN_LENGTH
    ? token
    : undefined;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
