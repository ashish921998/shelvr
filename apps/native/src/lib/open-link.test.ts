import { beforeEach, describe, expect, it, vi } from "vitest";

const openURL = vi.fn();
vi.mock("expo-linking", () => ({ openURL }));

const { openLink } = await import("./open-link");

describe("openLink", () => {
  beforeEach(() => openURL.mockReset());

  it("hands the link to the system instead of an in-app browser", async () => {
    openURL.mockResolvedValue(true);

    await expect(openLink("https://x.com/poteto")).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith("https://x.com/poteto");
  });
});
