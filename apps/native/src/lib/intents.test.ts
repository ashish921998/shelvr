import { beforeEach, describe, expect, it, vi } from "vitest";
import { INTENT_KINDS } from "@convex/model/itemFields";
import { runIntent } from "./intents";

const mock = vi.hoisted(() => ({
  os: "ios",
  openLink: vi.fn(async () => {}),
  openURL: vi.fn(async () => true),
  setStringAsync: vi.fn(async () => true),
  notificationAsync: vi.fn(async () => {}),
  createEventInCalendarAsync: vi.fn(async () => ({ action: "saved" })),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mock.os;
    },
  },
}));
vi.mock("@/lib/open-link", () => ({ openLink: mock.openLink }));
vi.mock("expo-linking", () => ({ openURL: mock.openURL }));
vi.mock("expo-clipboard", () => ({ setStringAsync: mock.setStringAsync }));
vi.mock("expo-haptics", () => ({
  notificationAsync: mock.notificationAsync,
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("expo-calendar/legacy", () => ({
  createEventInCalendarAsync: mock.createEventInCalendarAsync,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.os = "ios";
});

describe("runIntent", () => {
  it("opens a link in the in-app browser", async () => {
    await runIntent("open_url", "https://example.com/a");
    expect(mock.openLink).toHaveBeenCalledWith("https://example.com/a");
  });

  it("copies the value and confirms with a success haptic", async () => {
    await runIntent("copy", "WELCOME10");
    expect(mock.setStringAsync).toHaveBeenCalledWith("WELCOME10");
    expect(mock.notificationAsync).toHaveBeenCalledWith("success");
  });

  it("searches the web for the encoded value", async () => {
    await runIntent("web_search", "pasteis & nata");
    expect(mock.openLink).toHaveBeenCalledWith(
      "https://www.google.com/search?q=pasteis%20%26%20nata",
    );
  });

  it("opens Apple Maps on iOS and a geo link elsewhere", async () => {
    await runIntent("open_maps", "Time Out Market, Lisbon");
    expect(mock.openURL).toHaveBeenLastCalledWith(
      "https://maps.apple.com/?q=Time%20Out%20Market%2C%20Lisbon",
    );
    mock.os = "android";
    await runIntent("open_maps", "Time Out Market, Lisbon");
    expect(mock.openURL).toHaveBeenLastCalledWith(
      "geo:0,0?q=Time%20Out%20Market%2C%20Lisbon",
    );
  });

  it("dials and texts only the digits and a leading plus", async () => {
    await runIntent("call", "+351 (21) 123-4567");
    expect(mock.openURL).toHaveBeenLastCalledWith("tel:+351211234567");
    await runIntent("message", "+1 555.010.9999 ext");
    expect(mock.openURL).toHaveBeenLastCalledWith("sms:+15550109999");
  });

  it("starts an email to the address", async () => {
    await runIntent("email", "hello@example.com");
    expect(mock.openURL).toHaveBeenCalledWith("mailto:hello@example.com");
  });

  it("presents the system Add Event sheet with the value as its title", async () => {
    await runIntent("add_event", "Dinner at Taberna");
    expect(mock.createEventInCalendarAsync).toHaveBeenCalledWith({
      title: "Dinner at Taberna",
    });
  });

  it("acts on every kind the classifier can return", async () => {
    for (const kind of INTENT_KINDS) {
      vi.clearAllMocks();
      await runIntent(kind, "x");
      const calls =
        mock.openLink.mock.calls.length +
        mock.openURL.mock.calls.length +
        mock.setStringAsync.mock.calls.length +
        mock.createEventInCalendarAsync.mock.calls.length;
      expect(calls, kind).toBe(1);
    }
  });
});
