import { describe, expect, it } from "vitest";
import {
  MAX_CAPTURE_CONTEXT_INPUT,
  MAX_CAPTURE_NOTE_LENGTH,
  parseImageBegin,
  parseImageFinish,
  parseLinkOrNote,
} from "./captureRequest";

const OP = "siri:11111111-1111-4111-8111-111111111111";

describe("parseLinkOrNote", () => {
  it("accepts a link and a note", () => {
    expect(
      parseLinkOrNote({ operationId: OP, kind: "link", url: " https://a.co " }),
    ).toEqual({ operationId: OP, kind: "link", url: "https://a.co" });
    expect(
      parseLinkOrNote({
        operationId: OP,
        kind: "note",
        text: "hi",
        spaceId: "",
      }),
    ).toEqual({ operationId: OP, kind: "note", text: "hi" });
  });

  it("rejects missing, blank, oversized, and mistyped fields", () => {
    for (const body of [
      undefined,
      "note",
      [],
      { kind: "note", text: "hi" },
      { operationId: OP, kind: "note", text: " " },
      {
        operationId: OP,
        kind: "note",
        text: "x".repeat(MAX_CAPTURE_NOTE_LENGTH + 1),
      },
      { operationId: OP, kind: "link", url: 7 },
      { operationId: OP, kind: "note", text: "hi", spaceId: {} },
      { operationId: OP, kind: "image", text: "hi" },
    ]) {
      expect(parseLinkOrNote(body)).toBeUndefined();
    }
  });
});

describe("parseImageFinish", () => {
  it("keeps valid metadata and cuts overlong context", () => {
    const parsed = parseImageFinish({
      operationId: OP,
      storageId: "kg2abc",
      aspectRatio: 0.75,
      isSticker: true,
      context: "x".repeat(MAX_CAPTURE_CONTEXT_INPUT + 50),
    });
    expect(parsed).toMatchObject({
      operationId: OP,
      storageId: "kg2abc",
      aspectRatio: 0.75,
      isSticker: true,
    });
    expect(parsed?.context).toHaveLength(MAX_CAPTURE_CONTEXT_INPUT);
  });

  it("rejects a bad ratio, sticker flag, or missing storage id", () => {
    for (const extra of [
      { aspectRatio: 0 },
      { aspectRatio: Number.NaN },
      { isSticker: "yes" },
      { context: 12 },
      { storageId: "" },
    ]) {
      expect(
        parseImageFinish({ operationId: OP, storageId: "kg2abc", ...extra }),
      ).toBeUndefined();
    }
  });
});

describe("parseImageBegin", () => {
  it("needs an operation id", () => {
    expect(parseImageBegin({ operationId: OP })).toEqual({ operationId: OP });
    expect(parseImageBegin({})).toBeUndefined();
  });
});
