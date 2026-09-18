import { v, type Infer } from "convex/values";
import translations from "./notificationTranslations.json";
import { pluralRules } from "./localization";

/**
 * The non-function half of weekly-shelf push: the per-recipient delivery-state
 * validator `schema.ts` stores and `notificationDelivery.ts` advances, plus the
 * localized title/body that goes into the notification payload. Named for the
 * fields rather than the machine so it is not confused with
 * `convex/notificationDelivery.ts`, which holds the claim/finish/recover
 * Convex functions.
 */

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

/**
 * The longest item title a notification body carries. Past this the system
 * truncates for us, and it does so mid-word; trimming here keeps the ellipsis
 * on a word boundary whenever one sits close to the limit.
 */
const MAX_TITLE_LENGTH = 60;

export function truncateTitle(title: string): string | undefined {
  const trimmed = title.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
  const clipped = trimmed.slice(0, MAX_TITLE_LENGTH);
  const boundary = clipped.lastIndexOf(" ");
  // A title with no space near the end — a long slug, or a script that does
  // not space-separate — keeps the hard clip instead of losing most of its
  // characters to a boundary early in the string.
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
  }
> = translations;

/**
 * `count` is how many saves the shelf holds and `featuredTitle` is the one the
 * body names. Naming a save is the whole point of this copy: a count tells the
 * user they have unread things, which they already knew.
 *
 * Without a usable title it falls back to counting, which is what every build
 * before this one sent. The title is user content, so it is substituted
 * through a replacer function — a plain string replacement would let `$&` and
 * its siblings inside a title expand into the surrounding copy.
 */
export function digestCopy(
  locale: string | undefined,
  count: number,
  featuredTitle?: string,
) {
  const title =
    featuredTitle === undefined ? undefined : truncateTitle(featuredTitle);
  const selected = notificationLocale(locale) ?? "en";
  const copy = catalogs[selected];
  const format = (value: number) =>
    new Intl.NumberFormat(selected).format(value);

  if (title === undefined) {
    // Keep the established payload for devices registered by older clients.
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
      body: copy.namedSingle.replace("%{title}", () => title),
    };
  // The plural agrees with the *other* saves, not the shelf total: "and 1
  // more" alongside the named one, never "and 0 more".
  const others = count - 1;
  return {
    title: copy.title,
    body: copy.named[pluralRules[selected](others)]
      .replace("%{formattedCount}", format(others))
      .replace("%{title}", () => title),
  };
}
