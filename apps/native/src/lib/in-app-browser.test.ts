import { beforeEach, describe, expect, it, vi } from "vitest";

const openBrowserAsync = vi.fn();
vi.mock("expo-web-browser", () => ({ openBrowserAsync }));

const { openInAppBrowser } = await import("./in-app-browser");

describe("openInAppBrowser", () => {
  beforeEach(() => openBrowserAsync.mockReset());

  it("opens the tab in Shelvr's own task so Android recents shows one card", async () => {
    openBrowserAsync.mockResolvedValue({ type: "opened" });

    await expect(openInAppBrowser("https://x.com/poteto")).resolves.toEqual({
      type: "opened",
    });
    expect(openBrowserAsync).toHaveBeenCalledWith("https://x.com/poteto", {
      createTask: false,
    });
  });
});
