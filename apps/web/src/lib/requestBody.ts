export {
  BodyTooLargeError,
  readBoundedText,
} from "../../../native/convex/model/captureRequest";

import {
  clientIp,
  WAITLIST_SECRET_HEADER,
  WAITLIST_CLIENT_IP_HEADER,
} from "./convexForward";
import { convexSiteUrl } from "./convexSiteUrl";
import { serverLog } from "./serverLog";

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
