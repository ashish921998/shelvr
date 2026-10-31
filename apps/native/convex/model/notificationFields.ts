import { v, type Infer } from "convex/values";
import translations from "./notificationTranslations.json";
import { pluralRules } from "./localization";
import type { ReminderKind } from "./saveReminders";

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

export const reachedDevice = (recipient: Recipient): boolean =>
  recipient.state === "delivered" || recipient.state === "receipt";

export const awaitingOutcome = (recipient: Recipient): boolean =>
  recipient.state === "pending" || recipient.state === "receipt";

export function recipientError(recipient: Recipient, error: string): Recipient {
  const terminal = [
    "DeviceNotRegistered",
    "MessageTooBig",
    "InvalidCredentials",
    "MismatchSenderId",
  ].includes(error);
  return {
    token: recipient.token,
    locale: recipient.locale,
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

export const DIGEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_TITLE_LENGTH = 60;

export function truncateTitle(title: string): string | undefined {
  const trimmed = title.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
  const clipped = trimmed.slice(0, MAX_TITLE_LENGTH);
  const boundary = clipped.lastIndexOf(" ");
  const body =
    boundary > MAX_TITLE_LENGTH / 2 ? clipped.slice(0, boundary) : clipped;
  return `${body.replace(/[\s,;:.!?-]+$/u, "")}\u2026`;
}

const catalogs: Record<
  string,
  {
    title: string;
    body: Record<string, string>;
    named: Record<string, string>;
    namedSingle: string;
    namedShelf: Record<string, string>;
    namedShelfSingle: string;
    reminder: Record<ReminderKind, { title: string; body: string }>;
    tripEve: { title: string; body: Record<string, string> };
  }
> = translations;

export function digestCopy(
  locale: string | undefined,
  count: number,
  featuredTitle?: string,
  { olderIncluded = false }: { olderIncluded?: boolean } = {},
) {
  const title =
    featuredTitle === undefined ? undefined : truncateTitle(featuredTitle);
  const selected = notificationLocale(locale) ?? "en";
  const copy = catalogs[selected];
  const format = (value: number) =>
    new Intl.NumberFormat(selected).format(value);

  if (title === undefined) {
    if (locale === undefined)
      return {
        title: "Your weekly shelf is ready",
        body: `${count} saved things are waiting on your weekly shelf.`,
      };
    return {
      title: copy.title,
      body: copy.body[pluralRules[selected](count)].replace(
        "%{formattedCount}",
        format(count),
      ),
    };
  }

  if (count <= 1)
    return {
      title: copy.title,
      body: (olderIncluded ? copy.namedShelfSingle : copy.namedSingle).replace(
        "%{title}",
        () => title,
      ),
    };
  const others = count - 1;
  return {
    title: copy.title,
    body: (olderIncluded ? copy.namedShelf : copy.named)[
      pluralRules[selected](others)
    ]
      .replace("%{formattedCount}", format(others))
      .replace("%{title}", () => title),
  };
}

export function reminderCopy(
  locale: string | undefined,
  kind: ReminderKind,
  subject: string,
) {
  const title = truncateTitle(subject) ?? subject;
  const copy = catalogs[notificationLocale(locale) ?? "en"].reminder[kind];
  return {
    title: copy.title,
    body: copy.body.replace("%{title}", () => title),
  };
}

export function tripEveCopy(
  locale: string | undefined,
  city: string,
  count: number,
) {
  const selected = notificationLocale(locale) ?? "en";
  const copy = catalogs[selected].tripEve;
  return {
    title: copy.title.replace("%{city}", () => truncateTitle(city) ?? city),
    body: copy.body[pluralRules[selected](count)].replace(
      "%{formattedCount}",
      new Intl.NumberFormat(selected).format(count),
    ),
  };
}
