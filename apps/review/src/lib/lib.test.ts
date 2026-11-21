import { describe, expect, test } from "vitest";
import { bubbleLayout, fitWithin, pickMimeType } from "./recording";
import { buildThreads, countOpen } from "./threads";
import { formatTime, markerPercent, timeAgo } from "./time";

describe("time", () => {
  test("formats seconds as a clock", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9.9)).toBe("0:09");
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(null)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });

  test("places markers along the timeline", () => {
    expect(markerPercent(15, 60)).toBe(25);
    expect(markerPercent(90, 60)).toBe(100);
    expect(markerPercent(5, null)).toBe(0);
  });

  test("says how long ago", () => {
    expect(timeAgo(0, 30_000)).toBe("just now");
    expect(timeAgo(0, 5 * 60_000)).toBe("5m ago");
    expect(timeAgo(0, 3 * 3_600_000)).toBe("3h ago");
    expect(timeAgo(0, 2 * 86_400_000)).toBe("2d ago");
  });
});

describe("threads", () => {
  const row = (
    id: string,
    extra: Partial<{
      parentId: string;
      timestamp: number;
      resolved: boolean;
      at: number;
    }>,
  ) => ({
    _id: id,
    _creationTime: extra.at ?? 0,
    parentId: extra.parentId ?? null,
    timestamp: extra.timestamp ?? null,
    resolved: extra.resolved ?? false,
  });

  test("orders by moment in the video, then general notes", () => {
    const rows = [
      row("general", { at: 1 }),
      row("late", { timestamp: 20 }),
      row("early", { timestamp: 2 }),
      row("reply2", { parentId: "early", at: 9 }),
      row("reply1", { parentId: "early", at: 3 }),
      row("done", { timestamp: 1, resolved: true }),
    ];
    const open = buildThreads(rows, { showResolved: false });
    expect(open.map((t) => t.root._id)).toEqual(["early", "late", "general"]);
    expect(open[0].replies.map((r) => r._id)).toEqual(["reply1", "reply2"]);
    const all = buildThreads(rows, { showResolved: true });
    expect(all[0].root._id).toBe("done");
    expect(countOpen(rows)).toBe(3);
  });
});

describe("recording", () => {
  test("picks the first supported format", () => {
    expect(pickMimeType((t) => t === "video/mp4")).toBe("video/mp4");
    expect(pickMimeType(() => false)).toBeUndefined();
  });

  test("keeps the camera bubble in the bottom-left corner", () => {
    expect(bubbleLayout(1920, 1080)).toEqual({ size: 238, x: 36, y: 806 });
  });

  test("scales large screens down", () => {
    expect(fitWithin(3840, 2160, 1920)).toEqual({ width: 1920, height: 1080 });
    expect(fitWithin(1280, 720, 1920)).toEqual({ width: 1280, height: 720 });
  });
});
