/**
 * The four `/extension` routes in `apps/native/convex/http.ts`, as functions.
 *
 * Every failure the backend can answer with is a stable code, never a sentence:
 * the routes return `{ error: "<code>" }` and this module turns that into a
 * {@link ShelvrError} the UI switches on. Server copy is never rendered, so the
 * backend can reword or redact a message without changing what a user sees.
 */

/** How long a request may hang before we call it a network failure. Generous
 * enough for a cold backend, short enough that a wedged connection does not
 * leave the toolbar spinning. */
const TIMEOUT_MS = 15_000;

export class ShelvrError extends Error {
  /** @param {string} code @param {number | null} status */
  constructor(code, status = null) {
    super(code);
    this.name = "ShelvrError";
    this.code = code;
    this.status = status;
  }
}

async function request(endpoint, path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  let response;
  try {
    response = await fetch(`${endpoint}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Offline, DNS failure, timeout — anything that never reached the backend.
    // Distinct from a refusal because a save is worth retrying.
    throw new ShelvrError("offline");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ShelvrError(payload?.error ?? "save_failed", response.status);
  }
  return payload ?? {};
}

/** Trade a pairing code for this browser's connection token. */
export function pairBrowser(endpoint, code, label) {
  return request(endpoint, "/extension/pair", {
    method: "POST",
    body: { code, label },
  });
}

/** Confirm the token still works, and learn which account it saves into. */
export function fetchSession(endpoint, token) {
  return request(endpoint, "/extension/session", { token });
}

/**
 * Save one link. `operationId` is the idempotency key: a retry that reuses it
 * returns the first attempt's item instead of creating a second card, which is
 * what makes retrying a dropped response safe.
 */
export function saveLink(endpoint, token, url, operationId) {
  return request(endpoint, "/extension/save", {
    method: "POST",
    token,
    body: { url, operationId },
  });
}

/** Unpair this browser. The token is dead the moment this returns. */
export function disconnectBrowser(endpoint, token) {
  return request(endpoint, "/extension/disconnect", { method: "POST", token });
}
