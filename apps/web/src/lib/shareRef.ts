/**
 * A share link's token opens the shared item's preview, so analytics never
 * carries it. Both the app and this site report the same short SHA-256 prefix
 * instead, which is enough to join a share to its page views and installs.
 */
export async function shareRef(token: string): Promise<string | undefined> {
  try {
    const digest = await window.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    )
      .join("")
      .slice(0, 16);
  } catch {
    return undefined;
  }
}

/** The share page's URL with the token replaced, safe to send as a property. */
export function sharePageUrl(): string {
  return `${window.location.origin}/i/[token]`;
}
