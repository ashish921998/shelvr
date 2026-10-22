import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFirstSaveReminder,
  FIRST_SAVE_REMINDER_ID,
  firstSaveReminderTicket,
  reminderOptions,
  scheduleFirstSaveReminder,
} from "./first-save-reminder";

const notifications = vi.hoisted(() => ({
  cancel: vi.fn(),
  dismiss: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("expo-notifications", () => ({
  cancelScheduledNotificationAsync: notifications.cancel,
  dismissNotificationAsync: notifications.dismiss,
  scheduleNotificationAsync: notifications.schedule,
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: { title?: string }) =>
    params?.title ? `${key}:${params.title}` : key,
}));

beforeEach(() => vi.clearAllMocks());

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute);

const slots = (now: Date) =>
  reminderOptions(now).map(({ slot, at: when }) => [slot, when]);

describe("reminderOptions", () => {
  it("offers tonight, Saturday morning and the Tuesday after", () => {
    expect(slots(at(7, 14))).toEqual([
      ["tonight", at(7, 20)],
      ["weekend", at(10, 10)],
      ["nextWeek", at(13, 18)],
    ]);
  });

  it("moves to tomorrow evening once tonight is under an hour away", () => {
    expect(slots(at(7, 19, 1))[0]).toEqual(["tomorrow", at(8, 20)]);
    expect(slots(at(7, 19, 0))[0]).toEqual(["tonight", at(7, 20)]);
  });

  it("on a Friday night, this weekend is Sunday, not next Saturday", () => {
    expect(slots(at(9, 22))).toEqual([
      ["tomorrow", at(10, 20)],
      ["weekend", at(11, 10)],
      ["nextWeek", at(13, 18)],
    ]);
  });

  it("on a Saturday, the weekend is Sunday morning", () => {
    expect(slots(at(10, 9))).toEqual([
      ["tonight", at(10, 20)],
      ["weekend", at(11, 10)],
      ["nextWeek", at(13, 18)],
    ]);
  });

  it("once the weekend has nothing left, it is not offered", () => {
    expect(slots(at(10, 22))).toEqual([
      ["tomorrow", at(11, 20)],
      ["nextWeek", at(13, 18)],
    ]);
    expect(slots(at(11, 9))).toEqual([
      ["tonight", at(11, 20)],
      ["nextWeek", at(13, 18)],
    ]);
  });

  it("always lists the times in order", () => {
    for (let day = 5; day <= 11; day++) {
      for (const hour of [0, 9, 18, 19, 23]) {
        const times = reminderOptions(at(day, hour)).map((o) => o.at.getTime());
        expect(times[0]).toBeGreaterThan(at(day, hour).getTime());
        expect([...times].sort((a, b) => a - b)).toEqual(times);
        const weekend = reminderOptions(at(day, hour)).find(
          (o) => o.slot === "weekend",
        );
        if (weekend)
          expect(weekend.at.getTime() - at(day, hour).getTime()).toBeLessThan(
            6 * 24 * 60 * 60 * 1000,
          );
      }
    }
  });
});

describe("scheduleFirstSaveReminder", () => {
  it("replaces any earlier reminder with one that opens the save", async () => {
    await scheduleFirstSaveReminder({
      itemId: "item-1",
      title: "Lemon pasta",
      at: at(7, 20),
    });
    expect(notifications.cancel).toHaveBeenCalledWith(FIRST_SAVE_REMINDER_ID);
    expect(notifications.schedule).toHaveBeenCalledWith({
      identifier: FIRST_SAVE_REMINDER_ID,
      content: {
        title: "reminder.readTitle",
        body: "reminder.readBody:Lemon pasta",
        data: {
          url: "/item/item-1",
          kind: "first_save_reminder",
          notificationId: FIRST_SAVE_REMINDER_ID,
        },
      },
      trigger: { type: "date", date: at(7, 20), channelId: "save-reminders" },
    });
  });
});

describe("first-save reminder ticket", () => {
  const remind = (ticket: number) =>
    scheduleFirstSaveReminder({
      itemId: "item-1",
      title: "Lemon pasta",
      at: at(7, 20),
      ticket,
    });

  it("schedules nothing once a clear has run since the ticket", async () => {
    const ticket = firstSaveReminderTicket();
    await clearFirstSaveReminder();
    vi.clearAllMocks();
    await remind(ticket);
    expect(notifications.cancel).not.toHaveBeenCalled();
    expect(notifications.schedule).not.toHaveBeenCalled();
  });

  it("drops a reminder a clear overtook mid-schedule", async () => {
    const ticket = firstSaveReminderTicket();
    let clearing: Promise<void> | undefined;
    notifications.schedule.mockImplementationOnce(async () => {
      clearing = clearFirstSaveReminder();
    });
    await remind(ticket);
    await clearing;
    expect(notifications.schedule).toHaveBeenCalledTimes(1);
    expect(notifications.cancel).toHaveBeenCalledTimes(2);
    expect(notifications.cancel.mock.invocationCallOrder[1]).toBeGreaterThan(
      notifications.schedule.mock.invocationCallOrder[0],
    );
  });

  it("never lets an older schedule act after a newer one", async () => {
    const events: string[] = [];
    let releaseFirst: () => void = () => {};
    notifications.schedule
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = () => {
              events.push("A");
              resolve();
            };
          }),
      )
      .mockImplementationOnce(async () => {
        events.push("B");
      });
    notifications.cancel.mockImplementation(async () => {
      events.push("cancel");
    });
    const first = remind(firstSaveReminderTicket());
    await Promise.resolve();
    const clearing = clearFirstSaveReminder();
    const second = remind(firstSaveReminderTicket());
    await vi.waitFor(() => expect(notifications.schedule).toHaveBeenCalled());
    releaseFirst();
    await Promise.all([first, clearing, second]);
    expect(events.at(-1)).toBe("B");
    expect(events.indexOf("A")).toBeLessThan(events.indexOf("B"));
  });

  it("schedules normally with a current ticket", async () => {
    await remind(firstSaveReminderTicket());
    expect(notifications.schedule).toHaveBeenCalledTimes(1);
  });
});

describe("clearFirstSaveReminder", () => {
  it("cancels the scheduled reminder and removes a delivered one", async () => {
    await clearFirstSaveReminder();
    expect(notifications.cancel).toHaveBeenCalledWith(FIRST_SAVE_REMINDER_ID);
    expect(notifications.dismiss).toHaveBeenCalledWith(FIRST_SAVE_REMINDER_ID);
  });

  it("still dismisses a delivered reminder when the cancel fails", async () => {
    notifications.cancel.mockRejectedValueOnce(new Error("no"));
    await expect(clearFirstSaveReminder()).resolves.toBeUndefined();
    expect(notifications.dismiss).toHaveBeenCalledWith(FIRST_SAVE_REMINDER_ID);
  });
});
