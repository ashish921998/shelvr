import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import {
  useEntitlement,
  waitForSheetTransition,
  whenSheetSettled,
} from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import type { TextMessageKey } from "@/locales/message-types";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";

/**
 * A local notification two days before a free trial renews. The yearly plan
 * charges on day 7 unless cancelled, and a reminder is what makes starting a
 * trial feel safe. It is scheduled on the device, so it works without the
 * weekly shelf opt-in or a push token, and it ships over the air.
 *
 * Two earlier nudges ride along with it: day 1 asks for the next save and day
 * 3 points back to the shelf. Trials that ended in cancellation mostly held a
 * single save, so the week has to show the app doing something before the
 * day-5 reminder asks the user to decide.
 */

export const TRIAL_REMINDER_ID = "shelvr.trial-ending";
const CHANNEL_ID = "trial-reminder";
const LEAD_MS = 2 * 24 * 60 * 60 * 1000;
// A reminder due within this window is pointless: the trial ends first.
const MIN_LEAD_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_MS = 7 * DAY_MS;
// Nudges land in the day, never overnight.
const NUDGE_EARLIEST_HOUR = 10;
const NUDGE_LATEST_HOUR = 19;

type TrialNudge = {
  id: string;
  day: number;
  titleKey: TextMessageKey;
  bodyKey: TextMessageKey;
  url: string;
};

export const TRIAL_NUDGES: readonly TrialNudge[] = [
  {
    id: "shelvr.trial-day-1",
    day: 1,
    titleKey: "notifications.trialFirstDayTitle",
    bodyKey: "notifications.trialFirstDayBody",
    url: "/add",
  },
  {
    id: "shelvr.trial-day-3",
    day: 3,
    titleKey: "notifications.trialThirdDayTitle",
    bodyKey: "notifications.trialThirdDayBody",
    url: "/",
  },
];

// Every schedule and cancel shares one notification id, so they run one at a
// time: a slow, stale call can never finish after a newer one and undo it.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work);
  queue = next.catch(() => undefined);
  return next;
}

const askedKey = (userId: string) => `shelvr.trialReminderAsked.${userId}`;

/** When to remind, or null when the trial ends too soon for a reminder. */
export function trialReminderAt(expiresAt: number, now: number): number | null {
  const fireAt = expiresAt - LEAD_MS;
  return fireAt - now > MIN_LEAD_MS ? fireAt : null;
}

/**
 * When the nudge for `day` of a 7-day trial ending at `expiresAt` goes out:
 * that many days after the trial started, moved into daytime local hours.
 * Null once that moment has passed, which is also every trial shorter than a
 * week (store sandboxes).
 */
export function trialNudgeAt(
  expiresAt: number,
  day: number,
  now: number,
): number | null {
  // Calendar days, not 24-hour steps, so a DST change keeps the local hour.
  const at = new Date(expiresAt - TRIAL_MS);
  at.setDate(at.getDate() + day);
  const hour = at.getHours();
  if (hour < NUDGE_EARLIEST_HOUR) at.setHours(NUDGE_EARLIEST_HOUR, 0, 0, 0);
  else if (hour >= NUDGE_LATEST_HOUR) at.setHours(NUDGE_LATEST_HOUR, 0, 0, 0);
  const fireAt = at.getTime();
  return fireAt - now > MIN_LEAD_MS ? fireAt : null;
}

/**
 * The nudges follow the Save reminders switch in Profile. `getPreferences`
 * reports reminders off both for a user who turned them off and for one with
 * no preferences row yet (no device ever registered), and only the first is
 * an opt-out. A row always carries a timezone, so that tells them apart.
 */
export function trialNudgesAllowed(preferences: {
  remindersEnabled: boolean;
  timezone: string | null;
}): boolean {
  return preferences.remindersEnabled || preferences.timezone === null;
}

async function cancelTrialNudges(): Promise<void> {
  for (const nudge of TRIAL_NUDGES) {
    await Notifications.cancelScheduledNotificationAsync(nudge.id);
  }
}

export function canNotify(
  permission: Notifications.NotificationPermissionsStatus,
) {
  if (Platform.OS !== "ios") return permission.granted;
  const status = permission.ios?.status;
  return (
    status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

/**
 * Schedules (or replaces) the reminder for a trial ending at `expiresAt`.
 * Asks for notification permission only when `mayAsk` is set, which is the
 * moment a trial has just started. Returns whether a reminder is scheduled.
 * `isCurrent` turns false once the trial it was called for has ended or the
 * account changed, so a call left waiting on the permission prompt never
 * leaves a reminder behind.
 */
export async function scheduleTrialReminder(
  expiresAt: number,
  now: number,
  mayAsk: boolean,
  isCurrent: () => boolean = () => true,
  nudges = false,
): Promise<boolean> {
  const fireAt = trialReminderAt(expiresAt, now);
  if (fireAt === null) {
    await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
    await cancelTrialNudges();
    return false;
  }
  // Android 13 cannot request notification permission before a channel exists.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t("notifications.trialChannel"),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  // Cleared before the permission check, so switching nudges off takes
  // effect even while permission is denied.
  await cancelTrialNudges();
  let permission = await Notifications.getPermissionsAsync();
  if (!canNotify(permission) && mayAsk && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
    analytics.capture("trial_reminder_permission", {
      granted: canNotify(permission),
    });
  }
  if (!canNotify(permission) || !isCurrent()) return false;

  await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: TRIAL_REMINDER_ID,
    content: {
      title: t("notifications.trialEndingTitle"),
      body: t("notifications.trialEndingBody"),
      // `kind` and `notificationId` ride along so `notification_opened` can
      // attribute the tap to this reminder, the same way push notifications
      // carry theirs. Without them the open records as kind `unknown`.
      data: {
        url: "/profile",
        kind: "trial_reminder",
        notificationId: TRIAL_REMINDER_ID,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(fireAt),
      channelId: CHANNEL_ID,
    },
  });
  if (nudges) {
    for (const nudge of TRIAL_NUDGES) {
      const nudgeAt = trialNudgeAt(expiresAt, nudge.day, now);
      if (nudgeAt === null) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: nudge.id,
        content: {
          title: t(nudge.titleKey),
          body: t(nudge.bodyKey),
          // The nudge's own id, so a day-1 and a day-3 open are told apart by
          // `notification_id` under the shared `trial_nudge` kind.
          data: {
            url: nudge.url,
            kind: "trial_nudge",
            notificationId: nudge.id,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(nudgeAt),
          channelId: CHANNEL_ID,
        },
      });
    }
  }
  if (!isCurrent()) {
    await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
    await cancelTrialNudges();
    return false;
  }
  return true;
}

// The primer: one in-app screen that says what the reminder is for before the
// OS asks. A bare system prompt gives no reason, and a reason is what gets a
// yes. The hook awaits the answer; `TrialReminderPrimerSheet` renders it.
// Resolves true or false for the user's choice, null when the app closed it.
let primerAnswer: ((allow: boolean | null) => void) | null = null;
const primerListeners = new Set<() => void>();
const emitPrimer = () => primerListeners.forEach((listener) => listener());

function closePrimer(result: boolean | null) {
  const resolve = primerAnswer;
  if (!resolve) return;
  primerAnswer = null;
  emitPrimer();
  resolve(result);
}

export const trialReminderPrimer = {
  subscribe(listener: () => void) {
    primerListeners.add(listener);
    return () => primerListeners.delete(listener);
  },
  isOpen: () => primerAnswer !== null,
  /** Opens the primer and resolves with the choice. */
  request(): Promise<boolean | null> {
    closePrimer(null);
    return new Promise((resolve) => {
      primerAnswer = resolve;
      emitPrimer();
    });
  },
  /** The user's choice. */
  answer: (allow: boolean) => closePrimer(allow),
  /** Closes it without a choice: the trial it was for has ended. */
  dismiss: () => closePrimer(null),
};

// From a trial starting until its primer is answered or skipped. The welcome
// sheet waits on this: two modals at once can't present on iOS.
let primerHolds = 0;
let primerShown = false;
const primerDoneWaiters = new Set<() => void>();

function holdPrimer(): (shown: boolean) => void {
  primerHolds += 1;
  let released = false;
  return (shown) => {
    if (released) return;
    released = true;
    primerHolds -= 1;
    primerShown ||= shown;
    if (primerHolds > 0) return;
    const waiters = [...primerDoneWaiters];
    primerDoneWaiters.clear();
    for (const waiter of waiters) waiter();
  };
}

/**
 * Resolves once no trial reminder primer is pending, after its sheet has slid
 * away when one was on screen.
 */
export function whenTrialPrimerDone(): Promise<void> {
  if (primerHolds === 0) return Promise.resolve();
  return new Promise<void>((resolve) => primerDoneWaiters.add(resolve)).then(
    () => {
      const shown = primerShown;
      primerShown = false;
      return shown ? waitForSheetTransition() : undefined;
    },
  );
}

export function useTrialReminderPrimerOpen(): boolean {
  return useSyncExternalStore(
    trialReminderPrimer.subscribe,
    trialReminderPrimer.isOpen,
    trialReminderPrimer.isOpen,
  );
}

/**
 * Whether the OS prompt should follow, and whether the primer was on screen
 * (only then is there a closing sheet to wait out). No primer when permission
 * is already granted (nothing to ask) or refused for good (the OS would show
 * nothing).
 */
export async function confirmTrialReminderAsk(): Promise<{
  ask: boolean;
  primed: boolean;
}> {
  const permission = await Notifications.getPermissionsAsync();
  if (canNotify(permission)) return { ask: true, primed: false };
  if (!permission.canAskAgain) return { ask: false, primed: false };
  const allow = await trialReminderPrimer.request();
  if (allow === null) return { ask: false, primed: true };
  analytics.capture("trial_reminder_primer", {
    outcome: allow ? "accepted" : "declined",
  });
  return { ask: allow, primed: true };
}

async function cancelTrialReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
  await cancelTrialNudges();
  // A reminder already delivered is wrong once the trial converts or ends.
  await Notifications.dismissNotificationAsync(TRIAL_REMINDER_ID);
}

/**
 * Keeps the reminder in step with the entitlement. A trial that starts while
 * the app is open (the paywall just closed on a purchase) asks for
 * notification permission once per account, after the primer says why.
 * Trials already running only get a reminder when permission was granted some
 * other way, so nobody is asked cold on launch. Anything other than a trial
 * clears the reminder.
 */
export function useTrialReminder(): void {
  const { status, expiresAt, loading } = useEntitlement();
  const { data: user } = useCurrentUser();
  const userId = user?._id ?? null;
  const preferences = useQuery({
    ...convexQuery(api.notifications.getPreferences, userId ? {} : "skip"),
  });
  // Until the switch is known, hold off; if it cannot be read, the day-5
  // reminder still goes out, without the nudges.
  const nudgesKnown = preferences.data !== undefined || preferences.isError;
  const nudges =
    preferences.data !== undefined && trialNudgesAllowed(preferences.data);
  // The last settled status for this account, so a trial that begins while
  // the app is open can be told apart from one that was already running.
  const previous = useRef<{ userId: string; status: string } | null>(null);
  const scheduledFor = useRef<string | null>(null);
  // Bumped whenever the reminder should no longer exist, so scheduling work
  // still in flight from an earlier trial knows it is stale.
  const generation = useRef(0);

  useEffect(() => {
    if (loading) return;
    if (status !== "trialing" || expiresAt === undefined) {
      scheduledFor.current = null;
      generation.current += 1;
      trialReminderPrimer.dismiss();
      serial(cancelTrialReminder).catch((error) =>
        analytics.captureError("trial_reminder_cancel_failed", error),
      );
    }
    if (userId === null) {
      previous.current = null;
      return;
    }
    // Waiting leaves `previous` alone, so a trial that just started is still
    // told apart once the switch loads.
    if (status === "trialing" && expiresAt !== undefined && !nudgesKnown)
      return;
    const before =
      previous.current?.userId === userId ? previous.current.status : null;
    previous.current = { userId, status };
    if (status !== "trialing" || expiresAt === undefined) return;
    const key = `${expiresAt}:${nudges}`;
    if (scheduledFor.current === key) return;

    const justStarted = before !== null && before !== "trialing";
    let mayAsk = false;
    try {
      mayAsk = justStarted && SecureStore.getItem(askedKey(userId)) !== "1";
      if (mayAsk) SecureStore.setItem(askedKey(userId), "1");
    } catch (error) {
      // Without the once-per-account flag, don't ask; a granted permission
      // still gets the reminder.
      mayAsk = false;
      analytics.captureError("trial_reminder_flag_failed", error);
    }

    scheduledFor.current = key;
    generation.current += 1;
    const mine = generation.current;
    const isCurrent = () => generation.current === mine;
    // Taken now, in the same commit as the purchase, so the welcome sheet
    // sees it before its own wait ends.
    const releasePrimer = mayAsk ? holdPrimer() : null;
    void (async () => {
      let ask = mayAsk;
      if (ask) {
        let primed = false;
        try {
          // Nothing can present while a RevenueCat sheet is up or closing.
          await whenSheetSettled();
          if (!isCurrent()) return;
          const confirmed = await confirmTrialReminderAsk();
          ask = confirmed.ask;
          primed = confirmed.primed;
          if (!isCurrent()) return;
          // Nor over the closing primer, when one was shown.
          if (ask && primed) await waitForSheetTransition();
          if (!isCurrent()) return;
        } finally {
          // The OS prompt that follows is a system alert, not a modal, so
          // the welcome sheet need not wait for it.
          releasePrimer?.(primed);
        }
      }
      const scheduled = await serial(() =>
        scheduleTrialReminder(expiresAt, Date.now(), ask, isCurrent, nudges),
      );
      if (!scheduled && isCurrent()) scheduledFor.current = null;
    })().catch((error) => {
      if (isCurrent()) scheduledFor.current = null;
      analytics.captureError("trial_reminder_schedule_failed", error);
    });
  }, [status, expiresAt, loading, userId, nudges, nudgesKnown]);
}
