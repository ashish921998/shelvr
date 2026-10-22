import { v } from "convex/values";

export const feedbackSurfaceValidator = v.union(
  v.literal("home"),
  v.literal("profile"),
);

export const feedbackPlatformValidator = v.union(
  v.literal("ios"),
  v.literal("android"),
);

export const feedbackDeliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("unconfigured"),
  v.literal("delivered"),
  v.literal("failed"),
);
