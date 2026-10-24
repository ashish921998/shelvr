import { describe, expect, it } from "vitest";
import { setupProgress, shouldShowSetup } from "./setup-checklist";

const link = (url: string) => ({ type: "link" as const, url });

describe("setupProgress", () => {
  it("starts with nothing done", () => {
    expect(setupProgress([])).toEqual({
      tiktok: false,
      instagram: false,
      paste: false,
    });
  });

  it("ticks TikTok for a TikTok save, and Instagram for a reel or any image", () => {
    expect(
      setupProgress([link("https://www.tiktok.com/@a/video/1")]),
    ).toMatchObject({ tiktok: true, instagram: false });
    expect(
      setupProgress([link("https://www.instagram.com/reel/abc123/")]),
    ).toMatchObject({ tiktok: false, instagram: true });
    expect(setupProgress([{ type: "image" }])).toMatchObject({
      instagram: true,
    });
  });

  it("ticks the list once there is a note or three saves", () => {
    expect(setupProgress([{ type: "note" }]).paste).toBe(true);
    const sites = ["a", "b"].map((page) => link(`https://example.com/${page}`));
    expect(setupProgress(sites).paste).toBe(false);
    expect(setupProgress([...sites, link("https://example.com/c")]).paste).toBe(
      true,
    );
  });
});

describe("shouldShowSetup", () => {
  const done = { tiktok: true, instagram: true, paste: true };

  const open = { ...done, tiktok: false };

  it("hides once every step is done", () => {
    expect(shouldShowSetup(done, 2, true)).toBe(false);
    expect(shouldShowSetup({ ...done, instagram: false }, 2, true)).toBe(true);
  });

  it("leaves an account with a full shelf alone", () => {
    expect(shouldShowSetup(open, 20, true)).toBe(false);
  });

  it("shows only while the new account's save-goal card would, so a dismiss sticks", () => {
    expect(shouldShowSetup(open, 1, true)).toBe(true);
    // An older account past the goal, or one that tapped Not now.
    expect(shouldShowSetup(open, 5, false)).toBe(false);
    expect(shouldShowSetup(open, 0, false)).toBe(false);
  });
});
