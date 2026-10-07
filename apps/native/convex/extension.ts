/**
 * Browser-extension pairing and saves.
 *
 * The extension is a second front door onto one account: a toolbar button that
 * saves the page you are reading. It cannot sign in the way the app does —
 * Convex Auth's Google/Apple flows need a redirect surface the extension does
 * not have, and apps/web is a marketing site with no auth to borrow. So the
 * signed-in app vouches for the browser instead:
 *
 *   app: createPairingCode  ->  user types the code into the extension
 *   extension: POST /extension/pair  ->  one connection token, shown once
 *   extension: POST /extension/save  ->  a link save, bearer-authenticated
 *
 * Neither secret is stored in the clear (see `model/extensionAuth.ts`), the
 * token is scoped to one browser and revocable from the app, and the save path
 * is the in-app save path — `items.saveLinkForConnectedClient` — so the
 * extension can never save something the app would refuse.
 *
 * The public functions here are called by the app and derive their user from
 * `requireUserId`. The internal ones are called only by the HTTP routes in
 * `http.ts`, which have already proven the caller by hashing the credential it
 * presented; they take a hash, never a userId, so a caller cannot name the
 * account it wants to act on.
 */
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./model/auth";
import { rateLimiter } from "./model/rateLimiter";
import { saveLinkForConnectedClient } from "./items";
import {
  formatPairingCode,
  generatePairingCode,
  hashPairingCode,
  pairingCodeSecret,
  PAIRING_CODE_TTL_MS,
} from "./model/extensionAuth";
import { logEvent } from "./model/log";

/** Expired pairing codes removed per cron pass. Codes are one row each and
 * live ten minutes, so this drains far faster than they accumulate; the bound
 * is what keeps the sweep a small, predictable transaction. */
const PAIRING_CLEANUP_BATCH = 200;

/** Draws allowed before minting gives up. Each clash is a 2^-40 event, so
 * reaching the end of this means the generator is broken, not unlucky. */
const PAIRING_CODE_MINT_ATTEMPTS = 5;

/** What {@link storePairingCode} answers a mint with. Declared here so the
 * action can annotate its `runMutation` result rather than infer it. */
type StoredPairingCode =
  | { status: "stored"; expiresAt: number }
  | { status: "collision" };

const connectionValidator = v.object({
  id: v.id("extensionConnections"),
  label: v.string(),
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
});

// ---------------------------------------------------------------------------
// App-facing API
// ---------------------------------------------------------------------------

/**
 * Mint the pairing code the app displays, replacing any code this user already
 * has outstanding.
 *
 * An action rather than a mutation because minting needs Web Crypto: the code
 * is generated and hashed here, and only the hash reaches the database, so the
 * plaintext exists for exactly as long as it takes to render it on screen.
 */
export const createPairingCode = action({
  args: {},
  returns: v.object({ code: v.string(), expiresAt: v.number() }),
  // The return type is written out, not inferred: this handler calls a mutation
  // in its own module, so inferring it closes a cycle through the generated
  // `api` types (TS7022/7023) that collapses them to `{}` — and the errors then
  // surface in unrelated files rather than here.
  handler: async (ctx): Promise<{ code: string; expiresAt: number }> => {
    const userId = await requireUserId(ctx);
    // Fail closed, the way the RevenueCat webhook does without its secret: a
    // code minted under an unkeyed digest is one a database reader could
    // recover, and handing the user a weaker credential silently is worse
    // than telling them pairing is unavailable.
    const secret = pairingCodeSecret();
    if (secret === null) {
      logEvent("error", "extension_pairing_secret_missing", {});
      throw new Error("Pairing is unavailable");
    }
    // Draw until the digest is free. A clash is a 2^-40 draw against each live
    // row, so the first attempt all but always takes it; the loop exists so
    // that the one-in-forever case costs a user a redraw instead of a browser
    // paired to someone else's account.
    for (let attempt = 0; attempt < PAIRING_CODE_MINT_ATTEMPTS; attempt += 1) {
      const code = generatePairingCode();
      // Annotated because this calls a function in its own module, as the
      // Convex guidelines require; the cycle itself is broken by the handler's
      // return type above.
      const stored: StoredPairingCode = await ctx.runMutation(
        internal.extension.storePairingCode,
        { userId, codeHash: await hashPairingCode(code, secret) },
      );
      if (stored.status === "stored") {
        return { code: formatPairingCode(code), expiresAt: stored.expiresAt };
      }
    }
    // Every attempt clashing is not chance — it is a broken generator handing
    // out one value, which must never be papered over with a working-looking
    // code.
    logEvent("error", "extension_pairing_code_exhausted", {});
    throw new Error("Pairing is unavailable");
  },
});

/** The browsers currently paired to this account, newest first, for the app's
 * manage screen. The token hash never leaves the server. */
export const listConnections = query({
  args: {},
  returns: v.array(connectionValidator),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const connections = await ctx.db
      .query("extensionConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return connections
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((connection) => ({
        id: connection._id,
        label: connection.label,
        createdAt: connection.createdAt,
        lastUsedAt: connection.lastUsedAt,
      }));
  },
});

/**
 * Revoke one paired browser. The row IS the credential, so deleting it is the
 * revocation — the next request from that browser resolves to nothing and gets
 * a 401. Revoking someone else's connection is a no-op, not an error: the
 * ownership check is silent so a caller cannot probe for ids that exist.
 */
export const revokeConnection = mutation({
  args: { connectionId: v.id("extensionConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const connection = await ctx.db.get(args.connectionId);
    if (connection !== null && connection.userId === userId) {
      await ctx.db.delete(connection._id);
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Internal: called by the /extension HTTP routes
// ---------------------------------------------------------------------------

/**
 * Store the hash of a freshly minted code and return when it expires. One live
 * code per user: minting again invalidates the code still on screen, which is
 * what a user who taps "new code" expects.
 *
 * Refuses rather than stores when the digest is already in the table, so no two
 * live rows can share one. Redemption looks a code up by hash alone and has no
 * other way to tell whose it is, so a second row under the same digest would
 * hand the browser whichever row came back first — possibly the *other* user's
 * account. Regenerating is the whole fix: the caller simply draws another code.
 *
 * Checked before the limiter is charged, since a refusal writes nothing and
 * should not spend the user's budget for a mint they never saw. Nobody can
 * steer a request down this path to dodge the limiter — the digest is over a
 * code this server generated.
 */
export const storePairingCode = internalMutation({
  args: { userId: v.id("users"), codeHash: v.string() },
  returns: v.union(
    v.object({ status: v.literal("stored"), expiresAt: v.number() }),
    v.object({ status: v.literal("collision") }),
  ),
  handler: async (ctx, args) => {
    const clash = await ctx.db
      .query("extensionPairings")
      .withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash))
      .first();
    if (clash !== null) {
      return { status: "collision" as const };
    }
    await rateLimiter.limit(ctx, "extensionPairCode", {
      key: args.userId,
      throws: true,
    });
    // At most one row by construction (this mutation is the only writer, and
    // Convex serializes two racing calls), so the collect is bounded.
    const outstanding = await ctx.db
      .query("extensionPairings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const pairing of outstanding) {
      await ctx.db.delete(pairing._id);
    }
    const expiresAt = Date.now() + PAIRING_CODE_TTL_MS;
    await ctx.db.insert("extensionPairings", {
      userId: args.userId,
      codeHash: args.codeHash,
      expiresAt,
    });
    return { status: "stored" as const, expiresAt };
  },
});

/**
 * Trade a pairing code for a connection.
 *
 * The code is consumed whether or not it turns out to be usable, so a single
 * code can never mint two connections and a stale one cannot be ground
 * against.
 *
 * The limiter is charged only when the lookup misses. A hit is not a guess, so
 * refusing one buys nothing — and charging every attempt up front would let a
 * grinder drain the shared bucket and hold every legitimate pairing behind a
 * 429 for as long as they cared to keep it empty. Per-caller keying is not an
 * option here: Convex HTTP actions expose no client address, which is exactly
 * why the waitlist route can only limit per-IP after our own server forwards
 * the address behind a shared secret. `/extension/pair` has no such server in
 * front of it.
 *
 * Expired and unknown codes return the same answer: distinguishing them would
 * tell a guesser that a code exists, which is most of the secret.
 */
export const redeemPairingCode = internalMutation({
  args: {
    codeHash: v.string(),
    tokenHash: v.string(),
    label: v.string(),
  },
  returns: v.union(
    v.object({
      status: v.literal("paired"),
      label: v.string(),
      connectedAt: v.number(),
    }),
    v.object({ status: v.literal("invalid_code") }),
    v.object({ status: v.literal("rate_limited") }),
  ),
  handler: async (ctx, args) => {
    // `first`, not `unique`: two live rows sharing a hash is a 2^-40 event,
    // and answering it with a 500 would be worse than pairing the older code.
    const pairing = await ctx.db
      .query("extensionPairings")
      .withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash))
      .first();
    if (pairing === null) {
      // A miss is what guessing produces, so this is where the budget goes.
      // Mistyped codes land here too, which the burst is sized to absorb.
      const { ok } = await rateLimiter.limit(ctx, "extensionPairRedeem");
      if (!ok) {
        return { status: "rate_limited" as const };
      }
      return { status: "invalid_code" as const };
    }
    await ctx.db.delete(pairing._id);
    const now = Date.now();
    if (pairing.expiresAt <= now) {
      return { status: "invalid_code" as const };
    }
    await ctx.db.insert("extensionConnections", {
      userId: pairing.userId,
      tokenHash: args.tokenHash,
      label: args.label,
      createdAt: now,
    });
    return { status: "paired" as const, label: args.label, connectedAt: now };
  },
});

/**
 * Resolve a connection token hash for the extension's own status view: which
 * account it is attached to and under what label. A read, so checking status
 * does not write — `saveLink` is what refreshes `lastUsedAt`.
 */
export const describeConnection = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      label: v.string(),
      email: v.optional(v.string()),
      connectedAt: v.number(),
      lastUsedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("extensionConnections")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (connection === null) {
      return null;
    }
    // The popup shows the account it will save into, so a user with two
    // accounts can see at a glance which one this browser is attached to.
    const user = await ctx.db.get(connection.userId as Id<"users">);
    return {
      label: connection.label,
      email: user?.email,
      connectedAt: connection.createdAt,
      lastUsedAt: connection.lastUsedAt,
    };
  },
});

/**
 * Save a link on behalf of a paired browser.
 *
 * `url` is already canonical: the HTTP route runs the URL policy before
 * calling in, because a policy rejection is a plain Error whose identity does
 * not survive the function boundary, and a 400 with a reason is more use to
 * the extension than a redacted 500.
 *
 * Refusals that DO survive the boundary stay throws, so they arrive at the
 * route as the structured errors they already are: `saveError("pro_required")`
 * and the rate limiter's `ConvexError`. An unknown token is the one refusal
 * returned rather than thrown — it is the route's authentication answer, not
 * a failed save.
 */
export const saveLink = internalMutation({
  args: {
    tokenHash: v.string(),
    url: v.string(),
    operationId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ status: v.literal("saved"), itemId: v.id("items") }),
    v.object({ status: v.literal("duplicate"), itemId: v.id("items") }),
    v.object({ status: v.literal("unauthorized") }),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("extensionConnections")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (connection === null) {
      return { status: "unauthorized" as const };
    }
    const outcome = await saveLinkForConnectedClient(
      ctx,
      connection.userId as Id<"users">,
      args.url,
      { operationId: args.operationId },
    );
    // Written after the save so a refusal (no Pro, over the rate limit) rolls
    // it back too: "last used" means the last request this browser got a save
    // out of — a page already in the library counts, a rejected one does not.
    await ctx.db.patch(connection._id, { lastUsedAt: Date.now() });
    return outcome;
  },
});

/** Drop a connection at the extension's own request ("Disconnect" in the
 * popup). Holding the token is the authorization — it only ever deletes the
 * row that token resolves to. */
export const disconnect = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("extensionConnections")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (connection !== null) {
      await ctx.db.delete(connection._id);
    }
    return null;
  },
});

/**
 * Sweep pairing codes nobody redeemed. Redemption deletes the row it consumes,
 * so this only ever collects codes that were displayed and abandoned — they
 * are already inert (expiry is checked on redemption), this just stops them
 * accumulating. Bounded per run; a full batch means more remain and the next
 * pass takes them.
 */
export const cleanupExpiredPairings = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("extensionPairings")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", Date.now()))
      .take(PAIRING_CLEANUP_BATCH);
    for (const pairing of expired) {
      await ctx.db.delete(pairing._id);
    }
    return null;
  },
});
