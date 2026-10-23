import { getAuthUserId } from "@convex-dev/auth/server";
import type {
  RegisteredMutation,
  RegisteredQuery,
  ReturnValueForOptionalValidator,
} from "convex/server";
import type { ObjectType, PropertyValidators, Validator } from "convex/values";
import {
  env,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

const NOT_AUTHENTICATED = "Not authenticated";

/** Live owner row for a raw string id (webhook ids are untyped), or null if not a users id, gone, or deleting. */
export async function liveOwner(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<Doc<"users"> | null> {
  const id = ctx.db.normalizeId("users", userId);
  if (id === null) return null;
  const user = await ctx.db.get(id);
  return user !== null && user.deleting !== true ? user : null;
}

/** Stable users-table id (JWT `sub` is `userId|sessionId`, so not `identity.subject`), or throws. */
export async function requireUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error(NOT_AUTHENTICATED);
  }
  if ((await liveOwner(ctx, userId)) === null) {
    throw new Error(NOT_AUTHENTICATED);
  }
  return userId;
}

type Authed<Ctx> = Ctx & { userId: Id<"users"> };

type ReturnsValidator = Validator<unknown, "required", string>;

/**
 * Every public function declares `args` and `returns`, so both are required here.
 * `handler` is a method signature so its parameters compare bivariantly, which lets a
 * definition widen to `Widened` by plain assignment.
 */
type AuthedDefinition<
  Ctx,
  Args extends PropertyValidators,
  Returns extends ReturnsValidator,
  ReturnValue,
> = {
  args: Args;
  returns: Returns;
  handler(ctx: Authed<Ctx>, args: ObjectType<Args>): ReturnValue;
};

/**
 * Inside a builder TypeScript cannot match its generics against `query()`'s conditional
 * types, so each builder widens the definition to the shapes `query()` resolves. The
 * registered type is phantom in its arguments, so the result needs no cast back.
 */
type Widened<Ctx> = AuthedDefinition<
  Ctx,
  PropertyValidators,
  ReturnsValidator,
  unknown
>;

const authedFunctions = new WeakSet<object>();

/** True when `authedQuery` or `authedMutation` built `fn`, so every call runs `requireUserId` first. */
export function isAuthedFunction(fn: object): boolean {
  return authedFunctions.has(fn);
}

/** A public query that runs `requireUserId` before its handler, which gets the id as `ctx.userId`. */
export function authedQuery<
  Args extends PropertyValidators,
  Returns extends ReturnsValidator,
  ReturnValue extends ReturnValueForOptionalValidator<Returns>,
>(
  definition: AuthedDefinition<QueryCtx, Args, Returns, ReturnValue>,
): RegisteredQuery<"public", ObjectType<Args>, ReturnValue> {
  const { args, returns, handler }: Widened<QueryCtx> = definition;
  const built = query({
    args,
    returns,
    handler: async (ctx, input) =>
      await handler({ ...ctx, userId: await requireUserId(ctx) }, input),
  });
  authedFunctions.add(built);
  return built;
}

/** A public mutation that runs `requireUserId` before its handler, which gets the id as `ctx.userId`. */
export function authedMutation<
  Args extends PropertyValidators,
  Returns extends ReturnsValidator,
  ReturnValue extends ReturnValueForOptionalValidator<Returns>,
>(
  definition: AuthedDefinition<MutationCtx, Args, Returns, ReturnValue>,
): RegisteredMutation<"public", ObjectType<Args>, ReturnValue> {
  const { args, returns, handler }: Widened<MutationCtx> = definition;
  const built = mutation({
    args,
    returns,
    handler: async (ctx, input) =>
      await handler({ ...ctx, userId: await requireUserId(ctx) }, input),
  });
  authedFunctions.add(built);
  return built;
}

export async function isDevelopmentAnonymousUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  if (env.AUTH_ENABLE_ANONYMOUS !== "true") return false;
  const account = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", userId).eq("provider", "anonymous"),
    )
    .unique();
  return account !== null;
}

const MAX_SENDER_NAME_CHARS = 40;

export async function senderFirstName(
  ctx: QueryCtx,
  userId: string,
): Promise<string | undefined> {
  const id = ctx.db.normalizeId("users", userId);
  const user = id === null ? null : await ctx.db.get(id);
  const first = user?.name?.trim().split(/\s+/)[0];
  if (!first || first.length > MAX_SENDER_NAME_CHARS || first.includes("@")) {
    return undefined;
  }
  return first;
}
