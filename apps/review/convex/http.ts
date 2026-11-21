import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { auth } from "./auth";
import { parseMuxEvent } from "./model/muxEvent";
import { verifyMuxSignature } from "./model/muxSignature";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/mux/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = env.MUX_WEBHOOK_SECRET;
    if (!secret) return new Response("Not configured", { status: 503 });
    const body = await request.text();
    const valid = await verifyMuxSignature({
      header: request.headers.get("mux-signature"),
      body,
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    if (!valid) return new Response("Bad signature", { status: 401 });
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }
    const event = parseMuxEvent(payload);
    if (event.kind !== "ignored") {
      await ctx.runMutation(internal.media.applyMuxEvent, event);
    }
    return new Response(null, { status: 204 });
  }),
});

export default http;
