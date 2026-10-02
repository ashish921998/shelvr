/** Where the backend's X OAuth callback sends the browser when it is done.
 * Mirrors `X_APP_RETURN_URL` in convex/model/xApi.ts; the auth session closes
 * when the browser reaches it. */
export const X_CONNECT_RETURN_URL = "shelvr://import";

export type XConnectOutcome = "connected" | "failed" | "cancelled";

/** How an X connect attempt ended, from the auth session's result. A closed
 * browser is a cancel; a return without a recognized `x=` value is a failure,
 * since the backend always sets one. */
export function xConnectOutcome(
  result: { type: string; url?: string } | null | undefined,
): XConnectOutcome {
  if (result?.type !== "success" || typeof result.url !== "string") {
    return "cancelled";
  }
  try {
    const outcome = new URL(result.url).searchParams.get("x");
    return outcome === "connected" ? "connected" : "failed";
  } catch {
    return "failed";
  }
}
