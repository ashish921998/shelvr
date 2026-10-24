import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import {
  useEntitlement,
  waitForSheetTransition,
  whenSheetSettled,
} from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { createSheetRequestStore } from "@/lib/sheet-request-store";
import type { TextMessageKey } from "@/locales/message-types";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { AndroidImportance, IosAuthorizationStatus } from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import {
  DAY_MS,
  MIN_LEAD_MS,
  RENEWAL_WINDOW_MS,
  trialReminderAt,
  trialReminderLeadDays,
} from "@/lib/trial-reminder-lead";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";

export const TRIAL_REMINDER_ID = "shelvr.trial-ending";
export const TRIAL_LAST_DAY_ID = "shelvr.trial-last-day";
const CHANNEL_ID = "trial-reminder";
const TRIAL_MS = 7 * DAY_MS;
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

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work);
  queue = next.catch(() => undefined);
  return next;
}

const askedKey = (userId: string) => `shelvr.trialReminderAsked.${userId}`;

export function trialLastDayAt(expiresAt: number, now: number): number | null {
  const at = new Date(expiresAt - RENEWAL_WINDOW_MS);
  const ends = new Date(expiresAt);
  const dayBefore = new Date(expiresAt);
  dayBefore.setDate(dayBefore.getDate() - 1);
  if (at.toDateString() !== dayBefore.toDateString()) return null;
  if (
    at.getHours() < NUDGE_EARLIEST_HOUR &&
    ends.getHours() < NUDGE_EARLIEST_HOUR + 1
  )
    return null;
  if (at.getHours() >= NUDGE_LATEST_HOUR)
    at.setHours(NUDGE_LATEST_HOUR, 0, 0, 0);
  const fireAt = at.getTime();
  return fireAt - now > MIN_LEAD_MS ? fireAt : null;
}

export function trialNudgeAt(
  expiresAt: number,
  day: number,
  now: number,
): number | null {
  const at = new Date(expiresAt - TRIAL_MS);
  at.setDate(at.getDate() + day);
  const hour = at.getHours();
  if (hour < NUDGE_EARLIEST_HOUR) at.setHours(NUDGE_EARLIEST_HOUR, 0, 0, 0);
  else if (hour >= NUDGE_LATEST_HOUR) at.setHours(NUDGE_LATEST_HOUR, 0, 0, 0);
  const fireAt = at.getTime();
  return fireAt - now > MIN_LEAD_MS ? fireAt : null;
}

export function trialNudgesAllowed(preferences: {
  remindersEnabled: boolean;
}): boolean {
  return preferences.remindersEnabled;
}

async function cancelTrialNudges(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(TRIAL_LAST_DAY_ID);
  for (const nudge of TRIAL_NUDGES) {
    await Notifications.cancelScheduledNotificationAsync(nudge.id);
  }
}

function canNotify(permission: Notifications.NotificationPermissionsStatus) {
  if (Platform.OS !== "ios") return permission.granted;
  const status = permission.ios?.status;
  return (
    status === IosAuthorizationStatus.AUTHORIZED ||
    status === IosAuthorizationStatus.PROVISIONAL ||
    status === IosAuthorizationStatus.EPHEMERAL
  );
}

export async function scheduleTrialReminder(
  expiresAt: number,
  now: number,
  mayAsk: boolean,
  isCurrent: () => boolean = () => true,
  nudges = false,
): Promise<boolean> {
  const leadDays = trialReminderLeadDays();
  const fireAt = trialReminderAt(expiresAt, now, leadDays);
  // A day's lead already is the last-day warning.
  const lastDayAt = leadDays === 1 ? null : trialLastDayAt(expiresAt, now);
  if (fireAt === null && lastDayAt === null) {
    await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
    await cancelTrialNudges();
    return false;
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t("notifications.trialChannel"),
      importance: AndroidImportance.DEFAULT,
    });
  }
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
  if (fireAt !== null) {
    await Notifications.scheduleNotificationAsync({
      identifier: TRIAL_REMINDER_ID,
      content: {
        title: t("notifications.trialEndingTitle", { count: leadDays }),
        body: t("notifications.trialEndingBody"),
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
  }
  if (lastDayAt !== null) {
    await Notifications.scheduleNotificationAsync({
      identifier: TRIAL_LAST_DAY_ID,
      content: {
        title: t("notifications.trialLastDayTitle"),
        body: t("notifications.trialLastDayBody"),
        data: {
          url: "/profile",
          kind: "trial_reminder",
          notificationId: TRIAL_LAST_DAY_ID,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(lastDayAt),
        channelId: CHANNEL_ID,
      },
    });
  }
  if (nudges) {
    for (const nudge of TRIAL_NUDGES) {
      const nudgeAt = trialNudgeAt(expiresAt, nudge.day, now);
      if (nudgeAt === null) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: nudge.id,
        content: {
          title: t(nudge.titleKey),
          body: t(nudge.bodyKey),
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

const primer = createSheetRequestStore<true, boolean | null>(null);

export const trialReminderPrimer = {
  subscribe: primer.subscribe,
  isOpen: () => primer.current() !== null,
  request: () => primer.request(true),
  answer: (allow: boolean) => primer.resolve(allow),
  dismiss: () => primer.resolve(null),
};

let primerHolds = 0;
let primerShown = false;
let primerClosing: Promise<void> | null = null;
const primerDoneWaiters = new Set<(done: Promise<void>) => void>();

function holdPrimer(): (shown: boolean) => void {
  primerHolds += 1;
  let released = false;
  return (shown) => {
    if (released) return;
    released = true;
    primerHolds -= 1;
    primerShown ||= shown;
    if (primerHolds > 0) return;
    let done: Promise<void> = Promise.resolve();
    if (primerShown) {
      const closing = waitForSheetTransition().then(() => {
        if (primerClosing === closing) primerClosing = null;
      });
      primerClosing = closing;
      done = closing;
    }
    primerShown = false;
    const waiters = [...primerDoneWaiters];
    primerDoneWaiters.clear();
    for (const waiter of waiters) waiter(done);
  };
}

export function whenTrialPrimerDone(): Promise<void> {
  if (primerHolds === 0) return primerClosing ?? Promise.resolve();
  return new Promise<Promise<void>>((resolve) =>
    primerDoneWaiters.add(resolve),
  ).then((done) => done);
}

export function useTrialReminderPrimerOpen(): boolean {
  return useSyncExternalStore(
    trialReminderPrimer.subscribe,
    trialReminderPrimer.isOpen,
    trialReminderPrimer.isOpen,
  );
}

export async function confirmTrialReminderAsk(
  live: () => boolean = () => true,
): Promise<{
  ask: boolean;
  primed: boolean;
}> {
  const permission = await Notifications.getPermissionsAsync();
  if (canNotify(permission) || !permission.canAskAgain || !live())
    return { ask: false, primed: false };
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
  await Notifications.dismissNotificationAsync(TRIAL_REMINDER_ID);
  await Notifications.dismissNotificationAsync(TRIAL_LAST_DAY_ID);
}

export async function clearTrialReminder(): Promise<void> {
  await serial(cancelTrialReminder).catch((error) =>
    analytics.captureError("trial_reminder_cancel_failed", error),
  );
}

export function useTrialReminder(): void {
  const { status, expiresAt, loading } = useEntitlement();
  const { data: user } = useCurrentUser();
  const userId = user?._id ?? null;
  const preferences = useQuery({
    ...convexQuery(api.notifications.getPreferences, userId ? {} : "skip"),
  });
  const nudgesKnown = preferences.data !== undefined || preferences.isError;
  const nudges =
    preferences.data !== undefined && trialNudgesAllowed(preferences.data);
  const previous = useRef<{ userId: string; status: string } | null>(null);
  const scheduledFor = useRef<string | null>(null);
  const generation = useRef(0);
  const primerDecision = useRef<{
    expiresAt: number;
    ask: Promise<boolean>;
  } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (status !== "trialing" || expiresAt === undefined) {
      scheduledFor.current = null;
      generation.current += 1;
      primerDecision.current = null;
      trialReminderPrimer.dismiss();
      serial(cancelTrialReminder).catch((error) =>
        analytics.captureError("trial_reminder_cancel_failed", error),
      );
    }
    if (userId === null) {
      previous.current = null;
      return;
    }
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
      mayAsk = false;
      analytics.captureError("trial_reminder_flag_failed", error);
    }

    scheduledFor.current = key;
    generation.current += 1;
    const mine = generation.current;
    const isCurrent = () => generation.current === mine;
    let decision: Promise<boolean> = Promise.resolve(false);
    let pending: typeof primerDecision.current = null;
    if (mayAsk) {
      const releasePrimer = holdPrimer();
      const entry = { expiresAt, ask: decision };
      const live = () => primerDecision.current === entry;
      entry.ask = (async () => {
        let primed = false;
        try {
          await whenSheetSettled();
          if (!live()) return false;
          const confirmed = await confirmTrialReminderAsk(live);
          primed = confirmed.primed;
          if (!confirmed.ask || !live()) return false;
          if (primed) await waitForSheetTransition();
          return live();
        } finally {
          releasePrimer(primed);
        }
      })();
      primerDecision.current = entry;
      pending = entry;
    } else if (primerDecision.current?.expiresAt === expiresAt) {
      pending = primerDecision.current;
    }
    if (pending !== null) decision = pending.ask;
    void (async () => {
      const ask = await decision;
      if (!isCurrent()) return;
      if (pending !== null && primerDecision.current === pending)
        primerDecision.current = null;
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
