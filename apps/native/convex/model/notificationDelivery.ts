import { v, type Infer } from "convex/values";

const fields = { token: v.string(), error: v.optional(v.string()) };

export const recipientValidator = v.union(
  v.object({
    ...fields,
    state: v.literal("pending"),
    ticketId: v.optional(v.string()),
  }),
  v.object({ ...fields, state: v.literal("receipt"), ticketId: v.string() }),
  v.object({
    ...fields,
    state: v.literal("delivered"),
    ticketId: v.optional(v.string()),
  }),
  v.object({
    ...fields,
    state: v.literal("failed"),
    ticketId: v.optional(v.string()),
  }),
);

export type Recipient = Infer<typeof recipientValidator>;

export function recipientError(recipient: Recipient, error: string): Recipient {
  const terminal = [
    "DeviceNotRegistered",
    "MessageTooBig",
    "InvalidCredentials",
    "MismatchSenderId",
  ].includes(error);
  return {
    token: recipient.token,
    state: terminal ? "failed" : "pending",
    error,
  };
}
