import type { ConvexAuthConfig } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";

type AfterUserSaved = NonNullable<
  NonNullable<ConvexAuthConfig["callbacks"]>["afterUserCreatedOrUpdated"]
>;

export const recordAccountCreated = async (
  ctx: Parameters<AfterUserSaved>[0],
  { userId, existingUserId }: Pick<Parameters<AfterUserSaved>[1], "userId" | "existingUserId">,
) => {
  if (existingUserId !== null) return;
  const user = await ctx.db.get(userId);
  if (!user) return;
  await ctx.scheduler.runAfter(0, internal.accountTelemetry.capture, {
    userId,
    createdAt: user._creationTime,
  });
};
