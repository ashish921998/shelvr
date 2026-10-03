import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  env,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { insertImportedLinks, partitionImportUrls } from "./items";
import { requireUserId } from "./model/auth";
import { errorName, logEvent } from "./model/log";
import { rateLimiter } from "./model/rateLimiter";
import {
  X_API_ORIGIN,
  X_APP_RETURN_URL,
  X_CALLBACK_PATH,
  X_TOKEN_URL,
  authorizeUrl,
  basicAuth,
  bookmarkPostUrl,
  newOAuthSecret,
  parseBookmarksPage,
  parseMeResponse,
  parseTokenResponse,
  pkceChallenge,
  type XTokens,
} from "./model/xApi";
import {
  hasProEntitlementStatus,
  requireProEntitlement,
} from "./subscriptions";

// Automatic X bookmark import. The user connects X once (OAuth 2.0 with
// PKCE); from then on a cron reads their newest bookmarks and saves each new
// post through the normal link pipeline. See
// docs/architecture/automatic-imports.md for cost and the open questions.

/** How long a started handshake may take before its state is refused. */
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** Gap between automatic syncs of one account. X bills every bookmark a
 * sync reads, already-seen ones included, so this sets most of the cost. */
export const X_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Retry delay after the import bucket or X's own rate limit stopped a sync. */
const X_RETRY_MS = 60 * 60 * 1000;

/** "Sync now" is refused this soon after the last sync. */
const X_MANUAL_SYNC_COOLDOWN_MS = 15 * 60 * 1000;

/** Page sizes. Once the backfill is done most syncs find nothing new, and the
 * first page is all they pay for, so it is small. */
const BACKFILL_PAGE_SIZE = 50;
const INCREMENTAL_PAGE_SIZE = 10;

/** X returns at most the 800 newest bookmarks, so 20 pages of 50 covers the
 * backfill with room to spare. Incremental syncs stop far sooner. */
const MAX_PAGES_PER_SYNC = 20;

/** Accounts one cron run schedules. */
const DUE_SYNC_BATCH = 25;

const FETCH_TIMEOUT_MS = 15_000;

/** Refresh the access token when it has less than this left. */
const TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000;

function xCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = env.X_CLIENT_ID;
  const clientSecret = env.X_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function callbackUrl(): string {
  const site = process.env.CONVEX_SITE_URL;
  if (!site) throw new ConvexError("x_not_configured");
  return `${site.replace(/\/$/, "")}${X_CALLBACK_PATH}`;
}

const connectionValidator = v.object({
  status: v.union(v.literal("active"), v.literal("reconnect")),
  connectedAt: v.number(),
  lastSyncedAt: v.union(v.number(), v.null()),
  importedCount: v.number(),
});

/** Whether X import is offered on this deployment, and the caller's
 * connection if they have one. */
export const getXConnection = query({
  args: {},
  returns: v.object({
    available: v.boolean(),
    connection: v.union(connectionValidator, v.null()),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("xConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      available: xCredentials() !== null,
      connection:
        row === null
          ? null
          : {
              status: row.status,
              connectedAt: row.connectedAt,
              lastSyncedAt: row.lastSyncedAt ?? null,
              importedCount: row.importedCount,
            },
    };
  },
});

/** Starts connecting X: returns the X consent page to open in an auth
 * session. Any earlier unfinished handshake of this user is replaced. */
export const startXConnect = mutation({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    const credentials = xCredentials();
    if (credentials === null) throw new ConvexError("x_not_configured");

    const pending = await ctx.db
      .query("xOAuthStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(10);
    for (const row of pending) await ctx.db.delete(row._id);

    const state = newOAuthSecret();
    const codeVerifier = newOAuthSecret();
    await ctx.db.insert("xOAuthStates", {
      userId,
      state,
      codeVerifier,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });
    return {
      url: authorizeUrl({
        clientId: credentials.clientId,
        redirectUri: callbackUrl(),
        state,
        challenge: await pkceChallenge(codeVerifier),
      }),
    };
  },
});

/** Runs a sync now instead of at the next scheduled time. Returns false when
 * there is nothing to sync or the last sync was moments ago. */
export const syncXNow = mutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await requireProEntitlement(ctx, userId);
    const row = await ctx.db
      .query("xConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (row === null || row.status !== "active") return false;
    const now = Date.now();
    if (
      row.lastSyncedAt !== undefined &&
      now - row.lastSyncedAt < X_MANUAL_SYNC_COOLDOWN_MS
    ) {
      return false;
    }
    await ctx.db.patch(row._id, { nextSyncAt: now + X_SYNC_INTERVAL_MS });
    await ctx.scheduler.runAfter(0, internal.xImport.syncBookmarks, {
      connectionId: row._id,
    });
    return true;
  },
});

/** Stops importing from X and revokes Shelvr's token at X. Saves already
 * imported stay, and so does the record of which posts were handled, so
 * connecting again does not bring back saves the user deleted. */
export const disconnectX = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await removeXConnection(ctx, userId);
    return null;
  },
});

/** Drops the user's X connection and pending handshakes, revoking the token
 * at X in the background. Shared with account deletion. */
export async function removeXConnection(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const row = await ctx.db
    .query("xConnections")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (row !== null) {
    await ctx.scheduler.runAfter(0, internal.xImport.revokeToken, {
      token: row.refreshToken,
    });
    await ctx.db.delete(row._id);
  }
  const pending = await ctx.db
    .query("xOAuthStates")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(10);
  for (const state of pending) await ctx.db.delete(state._id);
}

// ---------------------------------------------------------------------------
// OAuth callback

/** Redeems a handshake's state once. Null when unknown or expired. */
export const consumeOAuthState = internalMutation({
  args: { state: v.string() },
  returns: v.union(
    v.object({ userId: v.id("users"), codeVerifier: v.string() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("xOAuthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (row === null) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt < Date.now()) return null;
    return { userId: row.userId, codeVerifier: row.codeVerifier };
  },
});

const tokensValidator = v.object({
  accessToken: v.string(),
  refreshToken: v.string(),
  accessTokenExpiresAt: v.number(),
});

/** Stores a freshly connected account and starts its first sync. Connecting
 * a different X account restarts the backfill; reconnecting the same one
 * keeps it. */
export const saveConnection = internalMutation({
  args: {
    userId: v.id("users"),
    xUserId: v.string(),
    tokens: tokensValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("xConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    let connectionId: Id<"xConnections">;
    if (existing !== null) {
      const sameAccount = existing.xUserId === args.xUserId;
      await ctx.db.patch(existing._id, {
        ...args.tokens,
        xUserId: args.xUserId,
        status: "active",
        connectedAt: sameAccount ? existing.connectedAt : now,
        backfillComplete: sameAccount ? existing.backfillComplete : false,
        nextSyncAt: now + X_SYNC_INTERVAL_MS,
        lastSyncError: undefined,
      });
      connectionId = existing._id;
    } else {
      connectionId = await ctx.db.insert("xConnections", {
        userId: args.userId,
        xUserId: args.xUserId,
        ...args.tokens,
        status: "active",
        connectedAt: now,
        backfillComplete: false,
        nextSyncAt: now + X_SYNC_INTERVAL_MS,
        importedCount: 0,
      });
    }
    await ctx.scheduler.runAfter(0, internal.xImport.syncBookmarks, {
      connectionId,
    });
    return null;
  },
});

/** Where X sends the browser after the user approves or declines. Exchanges
 * the code, stores the connection, and hands the browser back to the app
 * with `?x=connected` or `?x=failed`. */
export const oauthCallback = httpAction(async (ctx, req) => {
  const back = (outcome: "connected" | "failed") =>
    new Response(null, {
      status: 302,
      headers: { Location: `${X_APP_RETURN_URL}?x=${outcome}` },
    });
  const params = new URL(req.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code) return back("failed");

  const handshake = await ctx.runMutation(internal.xImport.consumeOAuthState, {
    state,
  });
  const credentials = xCredentials();
  if (handshake === null || credentials === null) return back("failed");

  try {
    const tokenRes = await fetch(X_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuth(
          credentials.clientId,
          credentials.clientSecret,
        ),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl(),
        code_verifier: handshake.codeVerifier,
      }).toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const tokens = tokenRes.ok
      ? parseTokenResponse(await tokenRes.json(), Date.now())
      : undefined;
    if (tokens === undefined) {
      logEvent("warn", "x_connect_failed", {
        stage: "token",
        status: tokenRes.status,
      });
      return back("failed");
    }
    const meRes = await fetch(`${X_API_ORIGIN}/2/users/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const xUserId = meRes.ok ? parseMeResponse(await meRes.json()) : undefined;
    if (xUserId === undefined) {
      logEvent("warn", "x_connect_failed", {
        stage: "me",
        status: meRes.status,
      });
      return back("failed");
    }
    await ctx.runMutation(internal.xImport.saveConnection, {
      userId: handshake.userId,
      xUserId,
      tokens,
    });
    logEvent("info", "x_connected", {});
    return back("connected");
  } catch (error) {
    logEvent("error", "x_connect_failed", {
      stage: "exception",
      error: errorName(error),
    });
    return back("failed");
  }
});

// ---------------------------------------------------------------------------
// Sync

/** What a sync needs, or null when it should not run: the connection is gone
 * or needs reconnecting, or the user no longer has Pro (no X spend then). */
export const loadForSync = internalQuery({
  args: { connectionId: v.id("xConnections") },
  returns: v.union(
    v.object({
      xUserId: v.string(),
      accessToken: v.string(),
      refreshToken: v.string(),
      accessTokenExpiresAt: v.number(),
      backfillComplete: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (row === null || row.status !== "active") return null;
    if (!(await hasProEntitlementStatus(ctx, row.userId))) return null;
    return {
      xUserId: row.xUserId,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      backfillComplete: row.backfillComplete,
    };
  },
});

export const storeTokens = internalMutation({
  args: { connectionId: v.id("xConnections"), tokens: tokensValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    if ((await ctx.db.get(args.connectionId)) === null) return null;
    await ctx.db.patch(args.connectionId, args.tokens);
    return null;
  },
});

/**
 * Saves one page of bookmarked posts. Posts handled by an earlier sync count
 * as `seen`. The rest become saves through the normal link pipeline, unless
 * the link is already saved, and are recorded so they are never imported
 * twice. When the `bulkImport` bucket cannot cover the page nothing is
 * written and `rateLimited` stops the sync; the next one picks them up.
 */
export const importBookmarkPage = internalMutation({
  args: {
    connectionId: v.id("xConnections"),
    postIds: v.array(v.string()),
    staggerOffset: v.number(),
  },
  returns: v.object({
    created: v.number(),
    seen: v.number(),
    rateLimited: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (connection === null || connection.status !== "active") {
      return { created: 0, seen: args.postIds.length, rateLimited: false };
    }
    const userId = connection.userId;
    const unseen: string[] = [];
    let seen = 0;
    for (const postId of args.postIds) {
      const handled = await ctx.db
        .query("xImportedPosts")
        .withIndex("by_user_and_postId", (q) =>
          q.eq("userId", userId).eq("postId", postId),
        )
        .unique();
      if (handled !== null || unseen.includes(postId)) {
        seen++;
      } else {
        unseen.push(postId);
      }
    }
    if (unseen.length === 0) return { created: 0, seen, rateLimited: false };

    const { fresh } = await partitionImportUrls(
      ctx,
      userId,
      unseen.map(bookmarkPostUrl),
    );
    if (fresh.length > 0) {
      const { ok } = await rateLimiter.limit(ctx, "bulkImport", {
        key: userId,
        count: fresh.length,
      });
      if (!ok) return { created: 0, seen, rateLimited: true };
      await insertImportedLinks(ctx, userId, fresh, args.staggerOffset);
    }
    for (const postId of unseen) {
      await ctx.db.insert("xImportedPosts", { userId, postId });
    }
    await ctx.db.patch(connection._id, {
      importedCount: connection.importedCount + fresh.length,
    });
    return { created: fresh.length, seen, rateLimited: false };
  },
});

const syncOutcomeValidator = v.union(
  v.literal("done"),
  v.literal("retry"),
  v.literal("reconnect"),
  v.literal("failed"),
);

/** Records how a sync ended and when the next one runs. */
export const finishSync = internalMutation({
  args: {
    connectionId: v.id("xConnections"),
    outcome: syncOutcomeValidator,
    backfillComplete: v.boolean(),
    errorCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.connectionId);
    if (row === null) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: args.outcome === "reconnect" ? "reconnect" : row.status,
      backfillComplete: row.backfillComplete || args.backfillComplete,
      lastSyncedAt:
        args.outcome === "done" || args.outcome === "retry"
          ? now
          : row.lastSyncedAt,
      lastSyncError: args.errorCode,
      nextSyncAt:
        args.outcome === "retry" ? now + X_RETRY_MS : now + X_SYNC_INTERVAL_MS,
    });
    return null;
  },
});

type RefreshResult = XTokens | "reconnect" | "failed";

async function refreshTokens(refreshToken: string): Promise<RefreshResult> {
  const credentials = xCredentials();
  if (credentials === null) return "failed";
  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(credentials.clientId, credentials.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // X answers a revoked or already-rotated refresh token with 400/401: the
  // user has to connect again. Anything else is worth another try later.
  if (res.status === 400 || res.status === 401) return "reconnect";
  if (!res.ok) return "failed";
  return parseTokenResponse(await res.json(), Date.now()) ?? "failed";
}

/**
 * Reads the user's bookmarks newest first and saves posts it has not seen.
 * Until the first full backfill completes it reads every page X offers;
 * after that it stops at the first page holding a post it already handled,
 * because everything below that was bookmarked earlier.
 */
export const syncBookmarks = internalAction({
  args: { connectionId: v.id("xConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { connectionId } = args;
    const conn = await ctx.runQuery(internal.xImport.loadForSync, {
      connectionId,
    });
    if (conn === null || xCredentials() === null) return null;

    const finish = async (
      outcome: "done" | "retry" | "reconnect" | "failed",
      backfillComplete: boolean,
      errorCode?: string,
    ) => {
      await ctx.runMutation(internal.xImport.finishSync, {
        connectionId,
        outcome,
        backfillComplete,
        errorCode,
      });
      logEvent(outcome === "done" ? "info" : "warn", "x_sync_finished", {
        outcome,
        error_code: errorCode,
      });
    };

    try {
      let accessToken = conn.accessToken;
      if (conn.accessTokenExpiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS) {
        const refreshed = await refreshTokens(conn.refreshToken);
        if (refreshed === "reconnect") {
          await finish("reconnect", false, "refresh_rejected");
          return null;
        }
        if (refreshed === "failed") {
          await finish("retry", false, "refresh_failed");
          return null;
        }
        // X rotates the refresh token on every use, so store it before
        // anything else can fail.
        await ctx.runMutation(internal.xImport.storeTokens, {
          connectionId,
          tokens: refreshed,
        });
        accessToken = refreshed.accessToken;
      }

      const pageSize = conn.backfillComplete
        ? INCREMENTAL_PAGE_SIZE
        : BACKFILL_PAGE_SIZE;
      let paginationToken: string | undefined;
      let created = 0;
      for (let page = 0; page < MAX_PAGES_PER_SYNC; page++) {
        const url = new URL(
          `${X_API_ORIGIN}/2/users/${conn.xUserId}/bookmarks`,
        );
        url.searchParams.set("max_results", String(pageSize));
        if (paginationToken) {
          url.searchParams.set("pagination_token", paginationToken);
        }
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (res.status === 401) {
          await finish("reconnect", false, "unauthorized");
          return null;
        }
        if (res.status === 429) {
          await finish("retry", false, "x_rate_limited");
          return null;
        }
        const parsed = res.ok
          ? parseBookmarksPage(await res.json())
          : undefined;
        if (parsed === undefined) {
          await finish("failed", false, `http_${res.status}`);
          return null;
        }
        const result = await ctx.runMutation(
          internal.xImport.importBookmarkPage,
          { connectionId, postIds: parsed.postIds, staggerOffset: created },
        );
        created += result.created;
        if (result.rateLimited) {
          await finish("retry", false, "import_rate_limited");
          return null;
        }
        if (conn.backfillComplete && result.seen > 0) break;
        if (parsed.nextToken === undefined) {
          await finish("done", true);
          return null;
        }
        paginationToken = parsed.nextToken;
      }
      await finish("done", conn.backfillComplete);
      return null;
    } catch (error) {
      await finish("failed", false, errorName(error));
      return null;
    }
  },
});

/** Cron: schedules the syncs that are due, a few seconds apart, and claims
 * each by moving its next sync forward so the next run does not repeat it. */
export const syncDueConnections = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (xCredentials() === null) return null;
    const now = Date.now();
    const due = await ctx.db
      .query("xConnections")
      .withIndex("by_status_and_nextSyncAt", (q) =>
        q.eq("status", "active").lte("nextSyncAt", now),
      )
      .take(DUE_SYNC_BATCH);
    for (const [index, row] of due.entries()) {
      await ctx.db.patch(row._id, { nextSyncAt: now + X_SYNC_INTERVAL_MS });
      await ctx.scheduler.runAfter(
        index * 5_000,
        internal.xImport.syncBookmarks,
        { connectionId: row._id },
      );
    }
    return null;
  },
});

/** Best-effort revoke at X after a disconnect. A failure leaves a token that
 * Shelvr no longer stores, which expires on its own. */
export const revokeToken = internalAction({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const credentials = xCredentials();
    if (credentials === null) return null;
    try {
      const res = await fetch(`${X_API_ORIGIN}/2/oauth2/revoke`, {
        method: "POST",
        headers: {
          Authorization: basicAuth(
            credentials.clientId,
            credentials.clientSecret,
          ),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          token: args.token,
          token_type_hint: "refresh_token",
        }).toString(),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        logEvent("warn", "x_revoke_failed", { status: res.status });
      }
    } catch (error) {
      logEvent("warn", "x_revoke_failed", { error: errorName(error) });
    }
    return null;
  },
});
