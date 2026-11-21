import { describe, expect, test } from "vitest";
import { parseMuxEvent } from "./muxEvent";
import { parseMuxSignature } from "./muxSignature";

describe("parseMuxEvent", () => {
  test("ignores events it does not understand", () => {
    expect(parseMuxEvent(null)).toEqual({ kind: "ignored" });
    expect(parseMuxEvent({ type: "video.asset.ready", data: {} })).toEqual({
      kind: "ignored",
    });
    expect(
      parseMuxEvent({
        type: "video.asset.deleted",
        data: { id: "a", passthrough: "m" },
      }),
    ).toEqual({ kind: "ignored" });
  });

  test("a ready asset without a playback id is an error", () => {
    expect(
      parseMuxEvent({
        type: "video.asset.ready",
        data: { id: "a", passthrough: "m", playback_ids: [] },
      }),
    ).toEqual({ kind: "errored", mediaId: "m", assetId: "a" });
  });
});

describe("parseMuxSignature", () => {
  test("reads the timestamp and every v1 signature", () => {
    expect(parseMuxSignature("t=10,v1=aa,v1=bb")).toEqual({
      timestamp: 10,
      signatures: ["aa", "bb"],
    });
    expect(parseMuxSignature(null)).toBeNull();
    expect(parseMuxSignature("v1=aa")).toBeNull();
    expect(parseMuxSignature("t=10")).toBeNull();
  });
});
