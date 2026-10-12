const TOKEN_URL = "https://appleid.apple.com/auth/token";

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Apple's client secret: a short-lived ES256 JWT signed with the team's .p8
 * key. WebCrypto's ECDSA signature is already the raw r||s form a JWT wants. */
export async function clientSecret(config: {
  clientId: string;
  privateKey: string;
  keyId: string;
  teamId: string;
}): Promise<string> {
  const der = Uint8Array.from(
    atob(
      config.privateKey
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
  const issuedAt = Math.floor(Date.now() / 1000);
  const signed = `${encodeJson({ alg: "ES256", kid: config.keyId })}.${encodeJson(
    {
      iss: config.teamId,
      iat: issuedAt,
      exp: issuedAt + 300,
      aud: "https://appleid.apple.com",
      sub: config.clientId,
    },
  )}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signed),
  );
  return `${signed}.${base64Url(new Uint8Array(signature))}`;
}

/**
 * Trades the native sheet's one-time authorization code for a refresh token,
 * the only thing Apple accepts when an account is deleted and its sign-in has
 * to be revoked. Returns null when Apple refuses or cannot be reached; the
 * caller treats that as "nothing to revoke later", never as a failed sign-in.
 */
export async function exchangeAuthorizationCode(config: {
  code: string;
  clientId: string;
  privateKey: string;
  keyId: string;
  teamId: string;
}): Promise<{
  refreshToken: string | null;
  /** Names the Apple account the code, and so the refresh token, belongs to. */
  identityToken: string | null;
  status?: number;
}> {
  const { code, ...signing } = config;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: await clientSecret(signing),
      grant_type: "authorization_code",
      code,
    }).toString(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok)
    return { refreshToken: null, identityToken: null, status: response.status };
  const body = (await response.json()) as {
    refresh_token?: unknown;
    id_token?: unknown;
  };
  return {
    refreshToken:
      typeof body.refresh_token === "string" ? body.refresh_token : null,
    identityToken: typeof body.id_token === "string" ? body.id_token : null,
    status: response.status,
  };
}
