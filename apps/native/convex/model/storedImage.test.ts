import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";

import {
  StoredImageError,
  readStoredImageBytes,
  type StoredImageStorage,
} from "./storedImage";

/** A byte pattern with values above 127 so identity checks catch any
 * sign-extension or encoding mangling. */
const PNG_LIKE_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xd8, 0xfe, 0x80,
]);
const imageId = "image-test-storage-id" as Id<"_storage">;

function storageReturning(blob: Blob | null): StoredImageStorage {
  return { get: vi.fn().mockResolvedValue(blob) };
}

describe("readStoredImageBytes", () => {
  it("returns the exact stored bytes, unmodified", async () => {
    const blob = new Blob([PNG_LIKE_BYTES], { type: "image/png" });
    const storage = storageReturning(blob);
    const bytes = await readStoredImageBytes(storage, imageId);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual(Array.from(PNG_LIKE_BYTES));
    expect(storage.get).toHaveBeenCalledWith(imageId);
  });

  it("does not truncate the stored image", async () => {
    const big = new Uint8Array(200 * 1024).fill(0x7f);
    const bytes = await readStoredImageBytes(
      storageReturning(new Blob([big])),
      imageId,
    );
    expect(bytes.byteLength).toBe(big.byteLength);
  });

  it("throws not_found when the file is missing or deleted", async () => {
    const err = await readStoredImageBytes(
      storageReturning(null),
      imageId,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(StoredImageError);
    expect(err.code).toBe("not_found");
    expect(err.message).not.toContain(imageId);
  });

  it("throws empty when the stored file holds no data", async () => {
    const err = await readStoredImageBytes(
      storageReturning(new Blob([])),
      imageId,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(StoredImageError);
    expect(err.code).toBe("empty");
  });

  it("propagates storage failures untouched", async () => {
    const failure = new Error("backend unavailable");
    await expect(
      readStoredImageBytes({ get: () => Promise.reject(failure) }, imageId),
    ).rejects.toBe(failure);
  });

  it("never touches a URL-based download path", async () => {
    // The helper must work with a storage object exposing only `get`; any
    // access to getUrl (the failing public-URL path) fails the test.
    const storage: StoredImageStorage = {
      get: () => Promise.resolve(new Blob([PNG_LIKE_BYTES])),
    };
    const spy = vi.fn();
    const proxied = new Proxy(storage, {
      get(target, prop) {
        if (prop === "getUrl") {
          spy();
          throw new Error("getUrl must not be used for stored images");
        }
        return Reflect.get(target, prop);
      },
    });
    const bytes = await readStoredImageBytes(proxied, imageId);
    expect(spy).not.toHaveBeenCalled();
    expect(Array.from(bytes)).toEqual(Array.from(PNG_LIKE_BYTES));
  });
});
