import { signEs256Jwt } from "./appleSigning";

const TOKEN_URL = "https://appleid.apple.com/auth/token";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";

export async function clientSecret(config: {
  clientId: string;
  privateKey: string;
  keyId: string;
  teamId: string;
}): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return await signEs256Jwt(
    config.privateKey,
    { kid: config.keyId },
    {
      iss: config.teamId,
      iat: issuedAt,
      exp: issuedAt + 300,
      aud: "https://appleid.apple.com",
      sub: config.clientId,
    },
  );
}

export async function exchangeAuthorizationCode(config: {
  code: string;
  clientId: string;
  privateKey: string;
  keyId: string;
  teamId: string;
}): Promise<{
  refreshToken: string | null;
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

export async function revokeRefreshToken(config: {
  refreshToken: string;
  clientId: string;
  privateKey: string;
  keyId: string;
  teamId: string;
}): Promise<number | undefined> {
  const { refreshToken, ...signing } = config;
  const secret = await clientSecret(signing);
  try {
    const response = await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: secret,
        token: refreshToken,
        token_type_hint: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    return response.status;
  } catch {
    return undefined;
  }
}
