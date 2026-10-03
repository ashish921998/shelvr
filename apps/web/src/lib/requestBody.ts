import {
  clientIp,
  WAITLIST_SECRET_HEADER,
  WAITLIST_CLIENT_IP_HEADER,
} from "./convexForward";
import { convexSiteUrl } from "./convexSiteUrl";
import { serverLog } from "./serverLog";

export class BodyTooLargeError extends Error {}

/** Web and native deploy independently. Keep this transport reader in the
 * web bundle rather than importing files excluded by Vercel's app root. */
export async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const length = request.headers.get("content-length");
  const encoding = request.headers.get("content-encoding");
  if (
    (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) ||
    (encoding !== null && encoding !== "identity")
  ) {
    await request.body?.cancel();
    throw new BodyTooLargeError();
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new BodyTooLargeError();
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function authorizeRequestBody(
  request: Request,
  route: "oracle" | "waitlist",
): Promise<Response | undefined> {
  const site = convexSiteUrl();
  const secret = process.env.WAITLIST_SHARED_SECRET;
  // The route's existing unconfigured response remains responsible for this.
  if (!site || !secret) return undefined;
  try {
    const ip = clientIp(request);
    const response = await fetch(`${site}/request-body`, {
      method: "POST",
      headers: {
        [WAITLIST_SECRET_HEADER]: secret,
        "x-shelvr-body-route": route,
        ...(ip ? { [WAITLIST_CLIENT_IP_HEADER]: ip } : {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) return undefined;
    if (response.status !== 429)
      serverLog("error", "request_body_authorization_failed", {
        status: response.status,
      });
    return Response.json(
      { message: "Please try again later." },
      { status: response.status === 429 ? 429 : 502 },
    );
  } catch {
    serverLog("error", "request_body_authorization_failed", { status: 0 });
    return Response.json(
      { message: "Please try again later." },
      { status: 502 },
    );
  }
}
