const TOLERANCE_SECONDS = 300;

export function parseMuxSignature(
  header: string | null,
): { timestamp: number; signatures: string[] } | null {
  if (!header) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((s) => s.trim());
    if (key === "t" && value) timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  if (timestamp === null || !Number.isFinite(timestamp)) return null;
  if (signatures.length === 0) return null;
  return { timestamp, signatures };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyMuxSignature({
  header,
  body,
  secret,
  nowSeconds,
}: {
  header: string | null;
  body: string;
  secret: string;
  nowSeconds: number;
}): Promise<boolean> {
  const parsed = parseMuxSignature(header);
  if (!parsed) return false;
  if (Math.abs(nowSeconds - parsed.timestamp) > TOLERANCE_SECONDS) {
    return false;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = toHex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${parsed.timestamp}.${body}`),
    ),
  );
  return parsed.signatures.some((signature) => equalHex(signature, expected));
}
