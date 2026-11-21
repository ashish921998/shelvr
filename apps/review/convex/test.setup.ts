import { convexTest } from "convex-test";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

export function newConvexTest() {
  return convexTest(schema, modules);
}

export type ConvexTest = ReturnType<typeof newConvexTest>;

export async function addUser(t: ConvexTest, email: string) {
  const userId: Id<"users"> = await t.run(async (ctx) =>
    ctx.db.insert("users", { email }),
  );
  return { userId, as: t.withIdentity({ subject: `${userId}|session` }) };
}

export async function addMember(
  t: ConvexTest,
  campaignId: Id<"campaigns">,
  email: string,
  role: "admin" | "creator",
) {
  const user = await addUser(t, email);
  await t.run(async (ctx) => {
    await ctx.db.insert("members", { campaignId, userId: user.userId, role });
  });
  return user;
}

export async function readyMedia(
  t: ConvexTest,
  campaignId: Id<"campaigns">,
  uploaderId: Id<"users">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("media", {
      campaignId,
      uploaderId,
      status: "ready",
      storageKey: "media/x",
      size: 1,
    }),
  );
}
