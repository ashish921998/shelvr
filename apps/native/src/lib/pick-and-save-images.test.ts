import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImagePickerResult } from "expo-image-picker";
import { pickAndSaveImages } from "./pick-and-save-images";

const { launchImageLibraryAsync } = vi.hoisted(() => ({
  launchImageLibraryAsync: vi.fn(),
}));

vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync }));
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
});
