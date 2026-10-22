// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";

import { constantTimeBytesEqual, secureCompare } from "./secureCompare";

describe("secureCompare", () => {
  it("accepts identical secrets", async () => {
    expect(await secureCompare("Bearer s3cret", "Bearer s3cret")).toBe(true);
    expect(await secureCompare("", "")).toBe(true);
  });

  it("rejects secrets of equal length that differ anywhere", async () => {
    expect(await secureCompare("Bearer s3cret", "Bearer s3creT")).toBe(false);
    expect(await secureCompare("Bearer s3cret", "Xearer s3cret")).toBe(false);
  });

  it("rejects secrets of different length, including a prefix match", async () => {
    expect(await secureCompare("Bearer s3cret", "Bearer s3cre")).toBe(false);
    expect(await secureCompare("Bearer s3cret", "Bearer s3cret!")).toBe(false);
    expect(await secureCompare("Bearer s3cret", "")).toBe(false);
    expect(await secureCompare("", "Bearer s3cret")).toBe(false);
  });

  it("is not fooled by unicode that renders alike", async () => {
    expect(await secureCompare("token-é", "token-é")).toBe(false);
  });
});

describe("constantTimeBytesEqual", () => {
  it("compares equal arrays", () => {
    expect(
      constantTimeBytesEqual(
        new Uint8Array([1, 2, 3]),
        new Uint8Array([1, 2, 3]),
      ),
    ).toBe(true);
    expect(constantTimeBytesEqual(new Uint8Array(0), new Uint8Array(0))).toBe(
      true,
    );
  });

  it("detects a difference in any position", () => {
    expect(
      constantTimeBytesEqual(
        new Uint8Array([1, 2, 3]),
        new Uint8Array([0, 2, 3]),
      ),
    ).toBe(false);
    expect(
      constantTimeBytesEqual(
        new Uint8Array([1, 2, 3]),
        new Uint8Array([1, 2, 4]),
      ),
    ).toBe(false);
  });

  it("rejects arrays of different length", () => {
    expect(
      constantTimeBytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2])),
    ).toBe(false);
  });
});
