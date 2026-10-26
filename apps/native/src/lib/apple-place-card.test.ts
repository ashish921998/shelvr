import { beforeEach, describe, expect, it, vi } from "vitest";
import { openPlaceOrSave } from "./apple-place-card";

const mocks = vi.hoisted(() => ({
  available: true,
  openPlaceCard: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock("../../modules/apple-place-card", () => ({
  placeCardAvailable: () => mocks.available,
  openPlaceCard: mocks.openPlaceCard,
}));
vi.mock("@/lib/analytics", () => ({ analytics: mocks }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));

beforeEach(() => {
  mocks.available = true;
  mocks.openPlaceCard.mockReset();
  mocks.captureError.mockReset();
});

describe("openPlaceOrSave", () => {
  it("shows the card with the save's title and the localized strip text", async () => {
    mocks.openPlaceCard.mockResolvedValue("dismissed");
    const openSave = vi.fn();
    await openPlaceOrSave("I1", "Best cafes", openSave);
    expect(mocks.openPlaceCard).toHaveBeenCalledWith({
      appleId: "I1",
      saveTitle: "Best cafes",
      fromYourSave: "cityMap.fromYourSave",
      openSave: "cityMap.openSave",
    });
    expect(openSave).not.toHaveBeenCalled();
  });

  it.each(["openSave", "unavailable"])(
    "opens the save when the card answers %s",
    async (result) => {
      mocks.openPlaceCard.mockResolvedValue(result);
      const openSave = vi.fn();
      await openPlaceOrSave("I1", "Best cafes", openSave);
      expect(openSave).toHaveBeenCalledOnce();
    },
  );

  it("opens the save when the card throws, and reports it", async () => {
    mocks.openPlaceCard.mockRejectedValue(new Error("boom"));
    const openSave = vi.fn();
    await openPlaceOrSave("I1", "Best cafes", openSave);
    expect(openSave).toHaveBeenCalledOnce();
    expect(mocks.captureError).toHaveBeenCalledWith(
      "place_card_failed",
      expect.any(Error),
    );
  });

  it("opens the save without asking Apple when the pin has no place id", async () => {
    const openSave = vi.fn();
    await openPlaceOrSave(undefined, "Best cafes", openSave);
    expect(mocks.openPlaceCard).not.toHaveBeenCalled();
    expect(openSave).toHaveBeenCalledOnce();
  });

  it("opens the save when the module is missing or the OS is too old", async () => {
    mocks.available = false;
    const openSave = vi.fn();
    await openPlaceOrSave("I1", "Best cafes", openSave);
    expect(mocks.openPlaceCard).not.toHaveBeenCalled();
    expect(openSave).toHaveBeenCalledOnce();
  });

  it("ignores a second tap while a card request is in flight", async () => {
    let finish: (result: string) => void = () => {};
    mocks.openPlaceCard.mockReturnValue(
      new Promise<string>((resolve) => (finish = resolve)),
    );
    const openSave = vi.fn();
    const first = openPlaceOrSave("I1", "Best cafes", openSave);
    await openPlaceOrSave("I1", "Best cafes", openSave);
    expect(mocks.openPlaceCard).toHaveBeenCalledOnce();
    finish("dismissed");
    await first;
    expect(openSave).not.toHaveBeenCalled();
  });
});
