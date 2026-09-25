import { type Reveal, revealSchema } from "./schema";

const MAX_CODE_LENGTH = 4096;

export function encodeReveal(reveal: Reveal): string {
  const bytes = new TextEncoder().encode(JSON.stringify(reveal));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeReveal(code: string): Reveal | undefined {
  if (code.length === 0 || code.length > MAX_CODE_LENGTH) return undefined;
  try {
    const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = revealSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
