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

export function sharePageUrl(): string {
  return `${window.location.origin}/i/[token]`;
}
