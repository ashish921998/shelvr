function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export async function signEs256(
  privateKey: string,
  text: string,
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
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(text),
  );
  return base64Url(new Uint8Array(signature));
}

export async function signEs256Jwt(
  privateKey: string,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const signed = `${encodeJson({ alg: "ES256", ...header })}.${encodeJson(payload)}`;
  return `${signed}.${await signEs256(privateKey, signed)}`;
}
