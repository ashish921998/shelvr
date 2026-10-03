import {
  decodeSharedVerdict,
  encodeSharedVerdict,
  type SharedVerdict,
} from "./oracleShare";

async function signingKey() {
  const secret = process.env.WAITLIST_SHARED_SECRET;
  if (!secret) throw new Error("Oracle signing is unconfigured");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`shelvr-oracle-v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function encodeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function signVerdict(verdict: SharedVerdict): Promise<string> {
  const payload = encodeSharedVerdict(verdict);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${encodeBytes(new Uint8Array(signature))}`;
}

export async function verifiedVerdict(
  code: string,
): Promise<SharedVerdict | undefined> {
  if (code.length > 4200) return undefined;
  const [payload, signature, extra] = code.split(".");
  if (
    !payload ||
    !signature ||
    extra !== undefined ||
    !/^[\w-]{43}$/.test(signature)
  )
    return undefined;
  try {
    const bytes = Uint8Array.from(
      atob(signature.replace(/-/g, "+").replace(/_/g, "/") + "="),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      bytes,
      new TextEncoder().encode(payload),
    );
    return valid ? decodeSharedVerdict(payload) : undefined;
  } catch {
    return undefined;
  }
}
