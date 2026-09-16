// Tests for the share screen's pure derivations. No React renderer and no
// native share module — these are plain functions of a session (or of the
// resolution outputs), which is the point of keeping them out of the screen.
import { describe, expect, it } from "vitest";

import {
  countPartial,
  countProgress,
  hasRetryableEntries,
  selectProcessorPayloads,
  withEntry,
} from "./session-view";
import type { ResolvedPayload } from "./process-share";
import {
  operationIdFor,
  type RawSharePayload,
  type ShareEntry,
  type ShareEntryStatus,
  type ShareSession,
} from "./storage";

const SESSION_ID = "sess-1";

/** Builds a session whose entries carry the given statuses, in order. */
function makeSession(statuses: ShareEntryStatus[]): ShareSession {
  const entries: ShareEntry[] = statuses.map((status, index) => ({
    index,
    operationId: operationIdFor(SESSION_ID, index),
    kind: "link",
    status,
  }));
  return {
    version: 1,
    fingerprint: "fp",
    userId: "user-a",
    sessionId: SESSION_ID,
    phase: "active",
    entries,
  };
}

const raw = (value: string, shareType = "text"): RawSharePayload => ({
  value,
  shareType,
});

const resolved = (
  value: string,
  contentType: ResolvedPayload["contentType"] = "text",
  contentUri: string | null = null,
): ResolvedPayload => ({
  contentType,
  value,
  contentUri,
  contentMimeType: null,
});

/** A natively resolved image. Its contentUri is something the raw fallback can
 * never derive, so any assertion on it proves the resolved branch was taken. */
const RESOLVED_IMAGE = resolved(
  "file:///tmp/a.jpg",
  "image",
  "content://shared/a.jpg",
);

describe("hasRetryableEntries", () => {
  it("is true while an entry is pending or failed", () => {
    expect(hasRetryableEntries(makeSession(["saved", "pending"]))).toBe(true);
    expect(hasRetryableEntries(makeSession(["saved", "failed"]))).toBe(true);
  });

  it("is false once every entry is saved or unsupported", () => {
    // Unsupported entries have nothing to retry, saved ones are never re-saved,
    // so the partial screen must not offer "Retry failed" here.
    expect(hasRetryableEntries(makeSession(["saved", "unsupported"]))).toBe(
      false,
    );
    expect(hasRetryableEntries(makeSession(["saved"]))).toBe(false);
  });
});

describe("countProgress / countPartial", () => {
  it("counts saved against the whole batch while saving", () => {
    expect(countProgress(makeSession(["saved", "pending", "failed"]))).toEqual({
      saved: 1,
      total: 3,
    });
  });

  it("counts unsupported entries as failures on the partial screen", () => {
    expect(
      countPartial(makeSession(["saved", "failed", "unsupported"])),
    ).toEqual({ saved: 1, failed: 2, total: 3 });
  });

  it("counts entries that reuse one item as a single save", () => {
    const session = makeSession(["saved", "saved", "pending"]);
    session.entries[0].itemId = "items:reel";
    session.entries[1].itemId = "items:reel";
    expect(countProgress(session)).toEqual({ saved: 1, total: 2 });
    expect(countPartial(session)).toEqual({ saved: 1, failed: 0, total: 2 });
  });

  it("reports zero failures when the batch only stalled", () => {
    // The orchestration-error path lands on the partial screen with entries
    // still pending, so the screen must be able to word itself from failed===0.
    expect(countPartial(makeSession(["saved", "pending"]))).toEqual({
      saved: 1,
      failed: 0,
      total: 2,
    });
  });
});

describe("withEntry", () => {
  it("replaces only the matching index and leaves the original untouched", () => {
    const session = makeSession(["pending", "pending"]);
    const settled: ShareEntry = {
      ...session.entries[1],
      status: "saved",
      itemId: "items:1",
    };

    const next = withEntry(session, settled);

    expect(next.entries.map((e) => e.status)).toEqual(["pending", "saved"]);
    expect(next.entries[0]).toBe(session.entries[0]);
    // The caller renders from the returned copy; the input must not mutate.
    expect(session.entries[1].status).toBe("pending");
  });
});

describe("selectProcessorPayloads", () => {
  it("uses the resolved payloads when resolution succeeded and counts align", () => {
    const payloads = selectProcessorPayloads({
      resolutionError: null,
      resolved: [RESOLVED_IMAGE],
      raw: [raw("file:///tmp/a.jpg", "image")],
    });

    // The fallback would leave contentUri null, so this fails if the resolved
    // branch is ever dropped in favour of always re-deriving from raw.
    expect(payloads).toEqual([
      {
        contentType: "image",
        value: "file:///tmp/a.jpg",
        contentUri: "content://shared/a.jpg",
        contentMimeType: null,
      },
    ]);
  });

  it("falls back to the raw payloads when resolution failed", () => {
    // A bot-hostile host can fail the whole resolution; a url share still has
    // everything the save needs in its raw value.
    const payloads = selectProcessorPayloads({
      resolutionError: new Error("resolve failed"),
      resolved: [],
      raw: [raw("https://a.example", "url")],
    });

    expect(payloads).toEqual([
      {
        contentType: "website",
        value: "https://a.example",
        contentUri: null,
        contentMimeType: null,
      },
    ]);
  });

  it("falls back when the resolved results no longer align with the raw batch", () => {
    const payloads = selectProcessorPayloads({
      resolutionError: null,
      resolved: [RESOLVED_IMAGE],
      raw: [raw("file:///tmp/a.jpg", "image"), raw("note body")],
    });

    expect(payloads.map((p) => p.contentType)).toEqual(["image", "text"]);
    // Every payload came from raw: the resolved contentUri was discarded, not
    // spliced in front of the fallback.
    expect(payloads[0].contentUri).toBeNull();
  });

  it("leaves fallback images without a contentUri so they fail explicitly", () => {
    // The raw fallback cannot reach the image bytes; classification turns this
    // into a reported failed entry rather than killing the whole share.
    const payloads = selectProcessorPayloads({
      resolutionError: new Error("resolve failed"),
      resolved: [],
      raw: [raw("file:///tmp/a.jpg", "image")],
    });

    expect(payloads[0]).toEqual({
      contentType: "image",
      value: "file:///tmp/a.jpg",
      contentUri: null,
      contentMimeType: null,
    });
  });
});
