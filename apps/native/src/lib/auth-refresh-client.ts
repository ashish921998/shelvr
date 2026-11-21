import { analytics } from "@/lib/analytics";
import { ConvexReactClient } from "convex/react";

type SetAuth = Parameters<ConvexReactClient["setAuth"]>;

function lostConnection(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "AbortError") return false;
  if (error.message.startsWith("fetch failed: ")) {
    return error.message !== "fetch failed: The operation was aborted.";
  }
  return /^(?:network request failed|failed to fetch|networkerror when attempting to fetch resource)\.?$/i.test(
    error.message,
  );
}

export class AuthRefreshClient extends ConvexReactClient {
  private session = 0;

  override setAuth(
    fetchToken: SetAuth[0],
    ...callbacks: [SetAuth[1]?, SetAuth[2]?]
  ) {
    const session = ++this.session;
    let latest = 0;
    super.setAuth(
      async (options) => {
        const attempt = ++latest;
        let delay = 1000;
        let reported = false;
        while (session === this.session && attempt === latest) {
          try {
            const token = await fetchToken(options);
            return session === this.session && attempt === latest
              ? token
              : null;
          } catch (error) {
            if (!options.forceRefreshToken || !lostConnection(error))
              throw error;
            if (!reported) {
              reported = true;
              analytics.captureError("auth_refresh_offline", error);
            }
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, 30_000);
          }
        }
        return null;
      },
      ...callbacks,
    );
  }

  override clearAuth() {
    this.session++;
    super.clearAuth();
  }

  override close() {
    this.session++;
    return super.close();
  }
}
