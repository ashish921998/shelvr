import { describe, expect, it, vi } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { ImageSaveResult } from "@/lib/use-save-image";
import {
  classifyEntries,
  classifyPayload,
  firstSharedUrl,
  processSession,
  resolvedFromRawPayloads,
  type ResolvedPayload,
  type ShareSaveDeps,
} from "./process-share";
import { countPartial, countProgress } from "./session-view";
import {
  operationIdFor,
  type RawSharePayload,
  type ShareEntry,
  type ShareSession,
} from "./storage";

vi.mock("@/lib/url", async () => {
  const actual = await vi.importActual<{
    isProbablyUrl: (t: string) => boolean;
    extractFirstUrl: (t: string) => string | null;
  }>("../url");
  return {
    isProbablyUrl: actual.isProbablyUrl,
    extractFirstUrl: actual.extractFirstUrl,
  };
});
vi.mock("@convex/_generated/dataModel", () => ({}));

function makeSession(entryCount: number, sessionId = "sess-1"): ShareSession {
  const entries: ShareEntry[] = Array.from(
    { length: entryCount },
    (_, index) => ({
      index,
      operationId: operationIdFor(sessionId, index),
      kind: "link",
      status: "pending" as const,
    }),
  );
  return {
    version: 1,
    fingerprint: "fp",
    userId: "user-a",
    sessionId,
    phase: "active",
    entries,
  };
}

function makeDeps(overrides: Partial<ShareSaveDeps> = {}): ShareSaveDeps {
  return {
    saveLink:
      overrides.saveLink ??
      (async ({ operationId }) => `items:link:${operationId}` as Id<"items">),
    saveNote:
      overrides.saveNote ??
      (async ({ operationId }) => `items:note:${operationId}` as Id<"items">),
    saveImage:
      overrides.saveImage ??
      (async ({ operationId }) => ({
        status: "saved" as const,
        operationId,
        image: { uri: "stub" },
        itemId: `items:image:${operationId}` as Id<"items">,
      })),
  };
}

const urlPayload = (value: string): ResolvedPayload => ({
  contentType: "website",
  value,
  contentUri: null,
  contentMimeType: null,
});
const textPayload = (value: string): ResolvedPayload => ({
  contentType: "text",
  value,
  contentUri: null,
  contentMimeType: null,
});
const imagePayload = (uri: string | null): ResolvedPayload => ({
  contentType: "image",
  value: uri ?? "",
  contentUri: uri,
  contentMimeType: "image/jpeg",
});

describe("classifyPayload", () => {
  it("classifies a valid website as a link", () => {
    expect(classifyPayload(urlPayload("https://example.com"))).toEqual({
      kind: "link",
    });
  });
  it("classifies text that looks like a URL as a link", () => {
    expect(classifyPayload(textPayload("example.com/path"))).toEqual({
      kind: "link",
      url: "example.com/path",
    });
  });
  it("extracts a URL wrapped in TikTok-style caption text as a link", () => {
    expect(
      classifyPayload(
        textPayload(
          "Check out this video! https://www.tiktok.com/@creator/video/7301234567890123456",
        ),
      ),
    ).toEqual({
      kind: "link",
      url: "https://www.tiktok.com/@creator/video/7301234567890123456",
    });
  });
  it("strips trailing sentence punctuation from an extracted URL", () => {
    expect(
      classifyPayload(textPayload("Loved this. https://x.com/user/status/1.")),
    ).toEqual({
      kind: "link",
      url: "https://x.com/user/status/1",
    });
  });
  it("classifies caption text without any URL as a note", () => {
    expect(
      classifyPayload(textPayload("Check out this account, it's great")),
    ).toEqual({
      kind: "note",
    });
  });
  it("classifies plain text as a note", () => {
    expect(classifyPayload(textPayload("a reminder"))).toEqual({
      kind: "note",
    });
  });
  it("classifies an image with a contentUri as image", () => {
    expect(classifyPayload(imagePayload("file://img.jpg"))).toEqual({
      kind: "image",
    });
  });
  it("fails an image with no contentUri", () => {
    expect(classifyPayload(imagePayload(null))).toEqual({
      kind: "image",
      reason: "Image could not be resolved",
    });
  });
  it("fails a website with a blank value", () => {
    expect(classifyPayload(urlPayload("   "))).toEqual({
      kind: "link",
      reason: "Shared link was not a valid URL",
    });
  });
  it("fails a website value that is not a URL", () => {
    expect(classifyPayload(urlPayload("not a url"))).toEqual({
      kind: "link",
      reason: "Shared link was not a valid URL",
    });
  });
  it("marks unsupported content types as unsupported, never a note", () => {
    expect(
      classifyPayload({
        contentType: "audio",
        value: "x",
        contentUri: "file://a",
        contentMimeType: null,
      }),
    ).toEqual({
      kind: "unsupported",
      reason: "Unsupported content type: audio",
    });
    expect(
      classifyPayload({
        contentType: "video",
        value: "x",
        contentUri: "file://v",
        contentMimeType: null,
      }),
    ).toMatchObject({
      kind: "unsupported",
    });
    expect(
      classifyPayload({
        contentType: "file",
        value: "x",
        contentUri: "file://f",
        contentMimeType: null,
      }),
    ).toMatchObject({
      kind: "unsupported",
    });
  });
  it("fails blank text rather than creating an empty note", () => {
    expect(classifyPayload(textPayload("   "))).toEqual({
      kind: "note",
      reason: "Shared text was empty",
    });
  });
});

describe("classifyEntries", () => {
  it("stamps kinds and terminal statuses without side effects", () => {
    const session = makeSession(3);
    const resolved = [
      textPayload("note"),
      imagePayload("file://img.jpg"),
      imagePayload(null),
    ];
    const entries = classifyEntries(session, resolved);
    expect(entries.map((e) => e.kind)).toEqual(["note", "image", "image"]);
    expect(entries.map((e) => e.status)).toEqual([
      "pending",
      "pending",
      "failed",
    ]);
    expect(entries[2].message).toBe("Image could not be resolved");
  });

  it("classifies URL-less text beside a shared link as that link", () => {
    const session = makeSession(3);
    const resolved = [
      textPayload("See this post"),
      urlPayload("https://a.example"),
      imagePayload("file://img.jpg"),
    ];
    const entries = classifyEntries(session, resolved);
    expect(entries.map((e) => [e.kind, e.status])).toEqual([
      ["link", "pending"],
      ["link", "pending"],
      ["image", "pending"],
    ]);
  });
});

describe("processSession", () => {
  it("saves all entries on full success and reports progress in order", () => {
    const session = makeSession(3);
    const resolved = [
      textPayload("note body"),
      imagePayload("file://a.jpg"),
      imagePayload("file://b.jpg"),
    ];
    const classified = classifyEntries(session, resolved);
    const settled: ShareEntry[] = [];
    const deps = makeDeps();

    return processSession(
      { ...session, entries: classified },
      resolved,
      deps,
      (e) => settled.push({ ...e }),
    ).then((result) => {
      expect(result.entries.map((e) => e.status)).toEqual([
        "saved",
        "saved",
        "saved",
      ]);
      expect(settled).toHaveLength(3);
      expect(settled.map((e) => e.index)).toEqual([0, 1, 2]);
    });
  });

  it("isolates a one-of-three failure: successes are retained", async () => {
    const session = makeSession(3);
    const resolved = [
      urlPayload("https://a.example"),
      urlPayload("https://b.example"),
      urlPayload("https://c.example"),
    ];
    const classified = classifyEntries(session, resolved);
    const deps = makeDeps({
      saveLink: async ({ url }) => {
        if (url.includes("b.example")) throw new Error("link b down");
        return `items:${url}` as Id<"items">;
      },
    });
    const result = await processSession(
      { ...session, entries: classified },
      resolved,
      deps,
    );

    expect(result.entries.map((e) => e.status)).toEqual([
      "saved",
      "failed",
      "saved",
    ]);
    const failed = result.entries[1];
    expect(failed.kind).toBe("link");
    expect(failed.message).toBe("link b down");
    expect(result.entries[0].itemId).toBeDefined();
    expect(result.entries[2].itemId).toBeDefined();
  });

  it("retries only failed entries on a second pass; saved entries are not re-saved", async () => {
    const saveLink = vi.fn(async ({ url, operationId }) => {
      if (url.includes("b.example")) throw new Error("still down");
      return `items:${operationId}` as Id<"items">;
    });
    const deps = makeDeps({ saveLink });

    const session = makeSession(3);
    const resolved = [
      urlPayload("https://a.example"),
      urlPayload("https://b.example"),
      urlPayload("https://c.example"),
    ];
    const classified = classifyEntries(session, resolved);
    const first = await processSession(
      { ...session, entries: classified },
      resolved,
      deps,
    );
    expect(first.entries.map((e) => e.status)).toEqual([
      "saved",
      "failed",
      "saved",
    ]);
    expect(saveLink).toHaveBeenCalledTimes(3);

    saveLink.mockClear();
    const second = await processSession(first, resolved, deps);
    expect(second.entries.map((e) => e.status)).toEqual([
      "saved",
      "failed",
      "saved",
    ]);
    expect(saveLink).toHaveBeenCalledTimes(1);
    expect(saveLink.mock.calls[0][0].operationId).toBe(
      operationIdFor("sess-1", 1),
    );
  });

  it("does not invoke save for unsupported entries", async () => {
    const session = makeSession(2);
    const resolved = [
      {
        contentType: "audio",
        value: "song",
        contentUri: "file://song",
        contentMimeType: null,
      },
      urlPayload("https://ok.example"),
    ] as ResolvedPayload[];
    const classified = classifyEntries(session, resolved);
    const saveLink = vi.fn(
      async ({ operationId }) => `items:${operationId}` as Id<"items">,
    );
    const deps = makeDeps({ saveLink });

    const result = await processSession(
      { ...session, entries: classified },
      resolved,
      deps,
    );
    expect(result.entries[0].status).toBe("unsupported");
    expect(result.entries[1].status).toBe("saved");
    expect(saveLink).toHaveBeenCalledTimes(1);
  });

  it("saves the extracted URL (not the caption text) for caption-wrapped shares", async () => {
    const session = makeSession(1);
    const resolved = [
      textPayload(
        "Check out this video! https://www.tiktok.com/@creator/video/7301234567890123456",
      ),
    ];
    const saveLink = vi.fn(
      async ({ url, operationId }) =>
        `items:${operationId}:${url}` as Id<"items">,
    );
    const saveNote = vi.fn(async () => "should-not-be-called" as Id<"items">);
    const deps = makeDeps({ saveLink, saveNote });

    const result = await processSession(session, resolved, deps);
    expect(result.entries[0].kind).toBe("link");
    expect(result.entries[0].status).toBe("saved");
    expect(saveLink).toHaveBeenCalledTimes(1);
    expect(saveLink.mock.calls[0][0].url).toBe(
      "https://www.tiktok.com/@creator/video/7301234567890123456",
    );
    expect(saveNote).not.toHaveBeenCalled();
  });

  it("saves one item when a share carries the same URL as a link and as caption text", async () => {
    const reel = "https://www.instagram.com/reel/DHVrPLrIyQ_/?igsh=abc123";
    const session = makeSession(2);
    const resolved = [urlPayload(reel), textPayload(reel)];
    const classified = classifyEntries(session, resolved);
    const saveLink = vi.fn(
      async ({ operationId }) => `items:${operationId}` as Id<"items">,
    );

    const result = await processSession(
      { ...session, entries: classified },
      resolved,
      makeDeps({ saveLink }),
    );

    expect(saveLink).toHaveBeenCalledTimes(1);
    expect(saveLink.mock.calls[0][0]).toEqual({
      url: reel,
      operationId: operationIdFor("sess-1", 0),
    });
    expect(result.entries.map((e) => [e.status, e.itemId])).toEqual([
      ["saved", `items:${operationIdFor("sess-1", 0)}`],
      ["saved", `items:${operationIdFor("sess-1", 0)}`],
    ]);
    expect(countProgress(result, resolved)).toEqual({ saved: 1, total: 1 });
    expect(countPartial(result, resolved)).toEqual({
      saved: 1,
      failed: 0,
      total: 1,
    });
  });

  it("saves one link item when a share pairs the link with caption text that has no URL", async () => {
    const reel =
      "https://www.instagram.com/reel/DHVrPLrIyQ_/?utm_source=ig_web_button_native_share";
    const session = makeSession(2);
    const resolved = [
      textPayload("See this Instagram post by @natgeo"),
      urlPayload(reel),
    ];
    const classified = classifyEntries(session, resolved);
    const saveLink = vi.fn(
      async ({ operationId }) => `items:${operationId}` as Id<"items">,
    );
    const saveNote = vi.fn(async () => "should-not-be-called" as Id<"items">);

    const result = await processSession(
      { ...session, entries: classified },
      resolved,
      makeDeps({ saveLink, saveNote }),
    );

    expect(saveNote).not.toHaveBeenCalled();
    expect(saveLink).toHaveBeenCalledTimes(1);
    expect(saveLink.mock.calls[0][0].url).toBe(reel);
    const itemId = saveLink.mock.calls[0][0].operationId;
    expect(result.entries.map((e) => [e.kind, e.status, e.itemId])).toEqual([
      ["link", "saved", `items:${itemId}`],
      ["link", "saved", `items:${itemId}`],
    ]);
    expect(countProgress(result, resolved)).toEqual({ saved: 1, total: 1 });
    expect(countPartial(result, resolved)).toEqual({
      saved: 1,
      failed: 0,
      total: 1,
    });
  });

  it("reuses a saved sibling's item when retrying a failed copy of the same URL", async () => {
    const reel = "https://www.instagram.com/reel/DHVrPLrIyQ_/";
    const resolved = [urlPayload(reel), textPayload(`Watch this ${reel}`)];
    const session = makeSession(2);
    const saveLink = vi.fn(async () => "items:new" as Id<"items">);
    const prior: ShareSession = {
      ...session,
      entries: [
        { ...session.entries[0], status: "saved", itemId: "items:first" },
        { ...session.entries[1], status: "failed", message: "offline" },
      ],
    };

    const result = await processSession(
      prior,
      resolved,
      makeDeps({ saveLink }),
    );

    expect(saveLink).not.toHaveBeenCalled();
    expect(result.entries.map((e) => [e.status, e.itemId])).toEqual([
      ["saved", "items:first"],
      ["saved", "items:first"],
    ]);
  });

  it("never reuses a note an older build saved from a link's caption", async () => {
    const reel = "https://www.instagram.com/reel/DHVrPLrIyQ_/";
    const resolved = [textPayload("See this post"), urlPayload(reel)];
    const session = makeSession(2);
    const saveLink = vi.fn(async () => "items:link" as Id<"items">);
    const prior: ShareSession = {
      ...session,
      entries: [
        {
          ...session.entries[0],
          kind: "note",
          status: "saved",
          itemId: "items:note",
        },
        { ...session.entries[1], status: "failed", message: "offline" },
      ],
    };

    const result = await processSession(
      prior,
      resolved,
      makeDeps({ saveLink }),
    );

    expect(saveLink).toHaveBeenCalledTimes(1);
    expect(result.entries.map((e) => [e.status, e.itemId])).toEqual([
      ["saved", "items:note"],
      ["saved", "items:link"],
    ]);
  });

  it("still saves distinct URLs separately", async () => {
    const session = makeSession(2);
    const resolved = [
      urlPayload("https://a.example/1"),
      textPayload("see https://a.example/2"),
    ];
    const saveLink = vi.fn(async ({ url }) => `items:${url}` as Id<"items">);

    await processSession(session, resolved, makeDeps({ saveLink }));

    expect(saveLink.mock.calls.map((c) => c[0].url)).toEqual([
      "https://a.example/1",
      "https://a.example/2",
    ]);
  });

  it("reports an image save failure from the injected save (a result, not a throw)", async () => {
    const session = makeSession(1);
    const resolved = [imagePayload("file://img.jpg")];
    const classified = classifyEntries(session, resolved);
    const deps = makeDeps({
      saveImage: async ({ operationId }) =>
        ({
          status: "failed" as const,
          operationId,
          image: { uri: "file://img.jpg" },
          stage: "upload" as const,
          message: "Upload failed (502)",
        }) satisfies ImageSaveResult,
    });
    const result = await processSession(
      { ...session, entries: classified },
      resolved,
      deps,
    );
    expect(result.entries[0].status).toBe("failed");
    expect(result.entries[0].message).toBe("Upload failed (502)");
  });

  it("deduplicates an idempotent re-process: a saved entry's operation is not re-invoked", async () => {
    const session = makeSession(2);
    const resolved = [
      urlPayload("https://a.example"),
      urlPayload("https://b.example"),
    ];
    const classified = classifyEntries(session, resolved);
    const saveLink = vi.fn(
      async ({ operationId }) => `items:${operationId}` as Id<"items">,
    );
    const deps = makeDeps({ saveLink });

    const pre = {
      ...session,
      entries: classified.map((e) =>
        e.index === 0
          ? { ...e, status: "saved" as const, itemId: "items:prior" }
          : e,
      ),
    };
    const result = await processSession(pre, resolved, deps);
    expect(result.entries[0].status).toBe("saved");
    expect(result.entries[0].itemId).toBe("items:prior");
    expect(saveLink).toHaveBeenCalledTimes(1);
  });

  it("retries a failed entry and reports saved when the backend now returns the existing item", async () => {
    let attempts = 0;
    const saveLink = vi.fn(async ({ operationId }) => {
      attempts += 1;
      if (attempts === 1) throw new Error("network blip");
      return "items:survived" as Id<"items">;
    });
    const deps = makeDeps({ saveLink });
    const session = makeSession(1);
    const resolved = [urlPayload("https://a.example")];
    const classified = classifyEntries(session, resolved);

    const first = await processSession(
      { ...session, entries: classified },
      resolved,
      deps,
    );
    expect(first.entries[0].status).toBe("failed");

    const second = await processSession(first, resolved, deps);
    expect(second.entries[0].status).toBe("saved");
    expect(second.entries[0].itemId).toBe("items:survived");
    expect(saveLink.mock.calls[0][0].operationId).toBe(
      saveLink.mock.calls[1][0].operationId,
    );
  });

  it("does not re-attempt a malformed link/note and never calls the backend", async () => {
    const session = makeSession(2);
    const resolved = [urlPayload("   "), textPayload("   ")];
    const classified = classifyEntries(session, resolved);
    expect(classified.map((e) => e.status)).toEqual(["failed", "failed"]);
    const saveLink = vi.fn(async () => "should-not-be-called" as Id<"items">);
    const saveNote = vi.fn(async () => "should-not-be-called" as Id<"items">);
    const deps = makeDeps({ saveLink, saveNote });

    const result = await processSession(
      { ...session, entries: classified },
      resolved,
      deps,
    );
    expect(result.entries.map((e) => e.status)).toEqual(["failed", "failed"]);
    expect(saveLink).not.toHaveBeenCalled();
    expect(saveNote).not.toHaveBeenCalled();
    expect(result.entries[0].message).toBe("Shared link was not a valid URL");
    expect(result.entries[1].message).toBe("Shared text was empty");
  });

  it("saves an image correctly on resume even if its persisted kind placeholder is link", async () => {
    const session = makeSession(1);
    const resolved = [imagePayload("file://img.jpg")];
    const persistedPending: ShareEntry[] = [
      { ...session.entries[0], kind: "link", status: "pending" },
    ];
    const saveImage = vi.fn(async ({ operationId }) => ({
      status: "saved" as const,
      operationId,
      image: { uri: "file://img.jpg" },
      itemId: "items:image-resume" as Id<"items">,
    }));
    const saveLink = vi.fn(async () => "should-not-be-called" as Id<"items">);
    const deps = makeDeps({ saveImage, saveLink });

    const result = await processSession(
      { ...session, entries: persistedPending },
      resolved,
      deps,
    );
    expect(result.entries[0].status).toBe("saved");
    expect(result.entries[0].itemId).toBe("items:image-resume");
    expect(saveImage).toHaveBeenCalledTimes(1);
    expect(saveLink).not.toHaveBeenCalled();
  });

  it("corrects a stale placeholder kind to the re-derived kind on resume", async () => {
    const session = makeSession(1);
    const resolved = [imagePayload("file://img.jpg")];
    const persistedPending: ShareEntry[] = [
      { ...session.entries[0], kind: "link", status: "pending" },
    ];
    const deps = makeDeps({
      saveImage: async ({ operationId }) => ({
        status: "saved" as const,
        operationId,
        image: { uri: "file://img.jpg" },
        itemId: "items:image-kind-fix" as Id<"items">,
      }),
    });

    const result = await processSession(
      { ...session, entries: persistedPending },
      resolved,
      deps,
    );
    expect(result.entries[0].kind).toBe("image");
    expect(result.entries[0].status).toBe("saved");
  });

  it("fails an image with no contentUri without a backend call", async () => {
    const session = makeSession(1);
    const resolved = [imagePayload(null)];
    const classified = classifyEntries(session, resolved);
    expect(classified[0].status).toBe("failed");
    const saveImage = vi.fn(async () => ({
      status: "saved" as const,
      operationId: "x",
      image: { uri: "x" },
      itemId: "should-not-be-called" as Id<"items">,
    }));
    const deps = makeDeps({ saveImage });
    const result = await processSession(
      { ...session, entries: classified },
      resolved,
      deps,
    );
    expect(result.entries[0].status).toBe("failed");
    expect(result.entries[0].message).toBe("Image could not be resolved");
    expect(saveImage).not.toHaveBeenCalled();
  });

  it("sanitizes URLs and ids out of a thrown failure message", async () => {
    const session = makeSession(1);
    const resolved = [urlPayload("https://a.example")];
    const classified = classifyEntries(session, resolved);
    const deps = makeDeps({
      saveLink: async () => {
        throw new Error(
          "POST https://upload.convex.cloud/abc failed kg2e5gqf40sy8kdqxcm3vp7hn96wtxyz",
        );
      },
    });
    const result = await processSession(
      { ...session, entries: classified },
      resolved,
      deps,
    );
    expect(result.entries[0].status).toBe("failed");
    expect(result.entries[0].message).not.toContain("https://");
    expect(result.entries[0].message).not.toContain(
      "kg2e5gqf40sy8kdqxcm3vp7hn96wtxyz",
    );
  });
});

describe("resolvedFromRawPayloads", () => {
  const raw = (
    value: string,
    shareType: string,
    mimeType?: string,
  ): RawSharePayload => ({ value, shareType, mimeType });

  it("maps url payloads to website with the raw value and mime type", () => {
    expect(
      resolvedFromRawPayloads([raw("https://x.com/p/1", "url", "text/html")]),
    ).toEqual([
      {
        contentType: "website",
        value: "https://x.com/p/1",
        contentUri: null,
        contentMimeType: "text/html",
      },
    ]);
  });

  it("maps text payloads to text with a null mime type when absent", () => {
    expect(resolvedFromRawPayloads([raw("check this out", "text")])).toEqual([
      {
        contentType: "text",
        value: "check this out",
        contentUri: null,
        contentMimeType: null,
      },
    ]);
  });

  it("keeps image payloads classified but without a contentUri, so they fail explicitly", async () => {
    const resolved = resolvedFromRawPayloads([raw("ph://IMG_0001", "image")]);
    expect(resolved[0].contentType).toBe("image");
    expect(resolved[0].contentUri).toBeNull();

    const session = makeSession(1);
    const classified = classifyEntries(session, resolved);
    expect(classified[0].kind).toBe("image");
    expect(classified[0].status).toBe("failed");
    const saveImage = vi.fn(async () => ({
      status: "saved" as const,
      operationId: "x",
      image: { uri: "x" },
      itemId: "unused" as Id<"items">,
    }));
    const result = await processSession(
      { ...session, entries: classified },
      resolved,
      makeDeps({ saveImage }),
    );
    expect(result.entries[0].status).toBe("failed");
    expect(saveImage).not.toHaveBeenCalled();
  });

  it("maps audio/video/file payloads to their unsupported content types", () => {
    const resolved = resolvedFromRawPayloads([
      raw("file://a.m4a", "audio"),
      raw("file://b.mp4", "video"),
      raw("file://c.pdf", "file"),
    ]);
    expect(resolved.map((p) => p.contentType)).toEqual([
      "audio",
      "video",
      "file",
    ]);
    const classified = classifyEntries(makeSession(3), resolved);
    expect(classified.map((e) => e.status)).toEqual([
      "unsupported",
      "unsupported",
      "unsupported",
    ]);
  });

  it("treats unknown share types as text so classification can still extract a link", () => {
    const resolved = resolvedFromRawPayloads([
      raw("watch this https://a.example/v", "bogus-type"),
    ]);
    expect(resolved[0].contentType).toBe("text");
    expect(classifyPayload(resolved[0])).toEqual({
      kind: "link",
      url: "https://a.example/v",
    });
  });

  it("classifies a fallback url payload as a saveable link", () => {
    const resolved = resolvedFromRawPayloads([
      raw("https://www.tiktok.com/@nasa/video/1", "url"),
    ]);
    expect(classifyPayload(resolved[0])).toEqual({ kind: "link" });
  });
});

describe("firstSharedUrl", () => {
  it("returns the first valid link, trimmed, skipping images and notes", () => {
    expect(
      firstSharedUrl([
        { value: "ph://IMG_0001", shareType: "image" },
        { value: "just a note", shareType: "text" },
        { value: " https://example.com/a ", shareType: "url" },
        { value: "https://example.com/b", shareType: "url" },
      ]),
    ).toBe("https://example.com/a");
  });

  it("extracts a link embedded in caption text", () => {
    expect(
      firstSharedUrl([
        {
          value: "Look at this https://www.instagram.com/p/abc",
          shareType: "text",
        },
      ]),
    ).toBe("https://www.instagram.com/p/abc");
  });

  it("returns null when nothing shared is a link", () => {
    expect(
      firstSharedUrl([
        { value: "not a url", shareType: "url" },
        { value: "a plain note", shareType: "text" },
      ]),
    ).toBeNull();
  });
});
