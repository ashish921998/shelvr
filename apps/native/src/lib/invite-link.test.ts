import { expect, it } from "vitest";
import { claimedInviteToken } from "./invite-link";

it("reads the list token from an invite link on either Shelvr web address", () => {
  expect(claimedInviteToken("https://tryshelvr.app/l/abc123")).toBe("abc123");
  expect(
    claimedInviteToken(" https://shelvr-web.vercel.app/l/abc123/ \n"),
  ).toBe("abc123");
});

it("ignores anything that is not a Shelvr list invite", () => {
  expect(claimedInviteToken("https://example.com/l/abc123")).toBeNull();
  expect(claimedInviteToken("http://tryshelvr.app/l/abc123")).toBeNull();
  expect(claimedInviteToken("https://tryshelvr.app/passport/abc")).toBeNull();
  expect(claimedInviteToken("dinner at 8?")).toBeNull();
  expect(claimedInviteToken("")).toBeNull();
});
