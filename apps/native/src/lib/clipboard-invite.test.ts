import { expect, it, vi } from "vitest";
import { clipboardInviteToken } from "./clipboard-invite";

vi.mock("expo-clipboard", () => ({}));
vi.mock("@/lib/pending-invite", () => ({}));
vi.mock("@/lib/analytics", () => ({}));
vi.mock("react-native", () => ({}));

it("reads the list token from an invite link on either Shelvr web address", () => {
  expect(clipboardInviteToken("https://tryshelvr.app/l/abc123")).toBe("abc123");
  expect(
    clipboardInviteToken(" https://shelvr-web.vercel.app/l/abc123/ \n"),
  ).toBe("abc123");
});

it("ignores anything that is not a Shelvr list invite", () => {
  expect(clipboardInviteToken("https://example.com/l/abc123")).toBeNull();
  expect(clipboardInviteToken("http://tryshelvr.app/l/abc123")).toBeNull();
  expect(clipboardInviteToken("https://tryshelvr.app/passport/abc")).toBeNull();
  expect(clipboardInviteToken("dinner at 8?")).toBeNull();
  expect(clipboardInviteToken("")).toBeNull();
});
