import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImagePickerResult } from "expo-image-picker";
import { pickAndSaveImages } from "./pick-and-save-images";

const { launchImageLibraryAsync, alert, captureError } = vi.hoisted(() => ({
  launchImageLibraryAsync: vi.fn(),
  alert: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync }));
vi.mock("react-native", () => ({ Alert: { alert } }));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/date", () => ({ parseExifDate: vi.fn(() => 1234) }));
vi.mock("@/lib/picked-image-location", () => ({
  resolvePickedImageLocation: vi.fn(async () => ({
    latitude: 12.3,
    longitude: 45.6,
  })),
}));

describe("pickAndSaveImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not run the save callback when the picker is cancelled", async () => {
    launchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: null,
    } satisfies ImagePickerResult);
    const runImageRequests = vi.fn();

    await pickAndSaveImages(runImageRequests);

    expect(runImageRequests).not.toHaveBeenCalled();
  });

  it("maps selected assets into save requests with metadata", async () => {
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///photo.jpg",
          width: 1200,
          height: 800,
          mimeType: "image/jpeg",
          exif: { DateTimeOriginal: "2026:01:02 03:04:05" },
        },
      ],
    } satisfies ImagePickerResult);
    const runImageRequests = vi.fn().mockResolvedValue(undefined);

    await pickAndSaveImages(runImageRequests);

    expect(runImageRequests).toHaveBeenCalledWith([
      {
        image: {
          uri: "file:///photo.jpg",
          width: 1200,
          height: 800,
          mimeType: "image/jpeg",
          capturedAt: 1234,
          latitude: 12.3,
          longitude: 45.6,
        },
      },
    ]);
  });

  it("says the pick failed instead of rejecting when the picker throws", async () => {
    const error = new Error("picker unavailable");
    launchImageLibraryAsync.mockRejectedValue(error);
    const runImageRequests = vi.fn();

    await expect(pickAndSaveImages(runImageRequests)).resolves.toBeUndefined();

    expect(runImageRequests).not.toHaveBeenCalled();
    expect(captureError).toHaveBeenCalledWith("image_pick_failed", error);
    expect(alert).toHaveBeenCalledWith("errors.saveTitle", "errors.tryAgain");
  });

  it("leaves a failed save to the save callback's own handling", async () => {
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///photo.jpg", width: 1, height: 1 }],
    } as ImagePickerResult);
    const failure = new Error("save failed");
    const runImageRequests = vi.fn().mockRejectedValue(failure);

    await expect(pickAndSaveImages(runImageRequests)).rejects.toBe(failure);
    expect(alert).not.toHaveBeenCalled();
  });
});
