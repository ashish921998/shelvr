import { describe, expect, test } from "vitest";
import { aspectRatio, cleanContentType, mediaKey, presign } from "./storage";

const config = {
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucket: "review",
};

describe("cleanContentType", () => {
  test("keeps video types and drops parameters", () => {
    expect(cleanContentType("video/mp4")).toBe("video/mp4");
    expect(cleanContentType(" Video/QuickTime ; x=1")).toBe("video/quicktime");
    expect(cleanContentType("video/webm;codecs=vp9")).toBe("video/webm");
  });

  test("refuses anything else", () => {
    for (const type of ["", "image/png", "text/html", "video/mp4x"]) {
      expect(() => cleanContentType(type)).toThrow("Upload a video file");
    }
  });
});

describe("aspectRatio", () => {
  test("reduces to lowest terms", () => {
    expect(aspectRatio(1080, 1920)).toBe("9:16");
    expect(aspectRatio(1920, 1080)).toBe("16:9");
    expect(aspectRatio(1000, 1000)).toBe("1:1");
  });

  test("ignores sizes that are not real", () => {
    expect(aspectRatio(0, 100)).toBeUndefined();
    expect(aspectRatio(Number.NaN, 100)).toBeUndefined();
  });
});

test("presign signs the query string for the object", async () => {
  const url = new URL(
    await presign(config, {
      key: mediaKey("abc"),
      method: "GET",
      expiresIn: 60,
    }),
  );
  expect(url.origin).toBe("https://acct.r2.cloudflarestorage.com");
  expect(url.pathname).toBe("/review/media/abc");
  expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
  expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^key\//);
  expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
});
