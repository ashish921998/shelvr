import { describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { MAX_STORED_IMAGE_BYTES, readStoredImage } from "./storedImage";

const imageId = "image-test-storage-id" as Id<"_storage">;

describe("readStoredImage", () => {
  it("preserves HEIC bytes and MIME metadata", async () => {
    const bytes = Uint8Array.from([
      0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 255,
    ]);
    const result = await readStoredImage(
      { get: async () => new Blob([bytes], { type: "image/heic" }) },
      imageId,
    );
    expect(result).toEqual({ bytes, mediaType: "image/heic" });
  });

  it("leaves absent MIME metadata for SDK detection", async () => {
    const result = await readStoredImage(
      { get: async () => new Blob(["bytes"]) },
      imageId,
    );
    expect(result.mediaType).toBeUndefined();
  });

  it.each([
    [null, "not_found"],
    [new Blob([]), "empty"],
  ] as const)(
    "rejects an unavailable blob with %s / %s",
    async (blob, code) => {
      await expect(
        readStoredImage({ get: async () => blob }, imageId),
      ).rejects.toMatchObject({ name: "StoredImageError", code });
    },
  );

  it("accepts the size boundary without truncation", async () => {
    const bytes = new Uint8Array(MAX_STORED_IMAGE_BYTES).fill(127);
    const result = await readStoredImage(
      { get: async () => new Blob([bytes]) },
      imageId,
    );
    expect(result.bytes.byteLength).toBe(bytes.byteLength);
    expect(Buffer.from(result.bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it("rejects an oversized file before reading its bytes", async () => {
    const blob = new Blob([new Uint8Array(MAX_STORED_IMAGE_BYTES + 1)]);
    const read = vi.spyOn(blob, "arrayBuffer");
    await expect(
      readStoredImage({ get: async () => blob }, imageId),
    ).rejects.toMatchObject({ code: "too_large" });
    expect(read).not.toHaveBeenCalled();
  });

  it("propagates temporary storage failures for retry", async () => {
    const error = new Error("backend unavailable");
    await expect(
      readStoredImage(
        {
          get: async () => {
            throw error;
          },
        },
        imageId,
      ),
    ).rejects.toBe(error);
  });
});

it.each([undefined, "image/jpeg"])(
  "recognizes HEIC with missing or incorrect metadata (%s)",
  async (type) => {
    const bytes = Uint8Array.from([
      0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0, 104, 101,
      105, 99, 109, 105, 102, 49,
    ]);
    const result = await readStoredImage(
      { get: async () => new Blob([bytes], { type }) },
      imageId,
    );
    expect(result.mediaType).toBe("image/heic");
    expect(result.bytes).toEqual(bytes);
  },
);
