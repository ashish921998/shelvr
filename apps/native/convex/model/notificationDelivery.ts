import { v, type Infer } from "convex/values";
import translations from "./notificationTranslations.json";

const fields = {
  token: v.string(),
  error: v.optional(v.string()),
  locale: v.optional(v.string()),
};

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

export function notificationLocale(
  locale: string | undefined,
): string | undefined {
  if (locale === undefined) return undefined;
  return Object.hasOwn(translations, locale) ? locale : "en";
}

export function digestCopy(locale: string | undefined, count: number) {
  // Keep the established payload for devices registered by older clients.
  if (locale === undefined)
    return {
      title: "Your weekly shelf is ready",
      body: `${count} saved things are waiting on your weekly shelf.`,
    };
  const catalogs: Record<string, { title: string; body: string }> =
    translations;
  const selected = notificationLocale(locale) ?? "en";
  const copy = catalogs[selected];
  return {
    title: copy.title,
    body: copy.body.replace(
      "%{count}",
      new Intl.NumberFormat(selected).format(count),
    ),
  };
}
