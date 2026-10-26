import {
  MAX_CONCURRENT_SAVES,
  reportSaveFailures,
  saveFailureReason,
  saveImageOperations,
  type ImageSaveResult,
  type SaveImageDeps,
} from "./use-save-image";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("@/lib/normalize-image", () => ({ normalizeImage: vi.fn() }));
const captured: unknown[] = [];
vi.mock("@/lib/analytics", () => ({
  analytics: {
    sessionId: () => undefined,
    capture: (...args: unknown[]) => captured.push(args),
  },
}));
vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("expo-crypto", () => {
  let n = 0;
  return { randomUUID: () => `stub-uuid-${++n}` };
});
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@convex/_generated/dataModel", () => ({}));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));

function makeDeps(overrides: Partial<SaveImageDeps> = {}): SaveImageDeps {
  return {
    begin:
      overrides.begin ??
      (async () => ({ kind: "upload", uploadUrl: "https://upload.test" })),
    normalize: overrides.normalize ?? (async (image) => image),
    upload: overrides.upload ?? (async () => "ks_storage_uploaded" as never),
    attach: overrides.attach ?? (async (_op, storageId) => ({ storageId })),
    finalize: overrides.finalize ?? (async () => "ks_items_final" as never),
  };
}

const img = (uri: string) => ({ uri });

describe("saveImageOperations", () => {
  it("returns one settled result per input in input order on full success", async () => {
    const deps = makeDeps();
    const requests = [
      { image: img("a") },
      { image: img("b") },
      { image: img("c") },
    ];
    const results = await saveImageOperations(requests, deps);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.status)).toEqual(["saved", "saved", "saved"]);
    expect(
      (results[0] as Extract<ImageSaveResult, { status: "saved" }>).image.uri,
    ).toBe("a");
    expect(
      (results[2] as Extract<ImageSaveResult, { status: "saved" }>).image.uri,
    ).toBe("c");
    for (const r of results) {
      expect(r.operationId).toMatch(/^image:stub-uuid-\d+$/);
    }
    expect(new Set(results.map((r) => r.operationId)).size).toBe(3);
  });

  it("reports a failed image without hiding its siblings' successes", async () => {
    const deps = makeDeps({
      upload: async (image) => {
        if (image.uri === "b") throw new Error("boom");
        return "ks_storage_ok" as never;
      },
    });
    const results = await saveImageOperations(
      [{ image: img("a") }, { image: img("b") }, { image: img("c") }],
      deps,
    );

    expect(results.map((r) => r.status)).toEqual(["saved", "failed", "saved"]);
    const failed = results[1] as Extract<ImageSaveResult, { status: "failed" }>;
    expect(failed.stage).toBe("upload");
    expect(failed.message).toBe("boom");
  });

  it("reports a soft attach rejection and finalizes only successful siblings", async () => {
    const finalize = vi.fn<SaveImageDeps["finalize"]>(
      async () => "ks_items_final" as never,
    );
    const deps = makeDeps({
      attach: async (operationId, storageId) =>
        operationId === "image:rejected"
          ? { storageId, error: "This photo is empty. Please save it again." }
          : { storageId },
      finalize,
    });
    const results = await saveImageOperations(
      [
        { image: img("empty"), operationId: "image:rejected" },
        { image: img("valid"), operationId: "image:valid" },
      ],
      deps,
    );
    expect(results[0]).toEqual({
      status: "failed",
      operationId: "image:rejected",
      image: img("empty"),
      stage: "attach",
      message: "This photo is empty. Please save it again.",
    });
    expect(results[1].status).toBe("saved");
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: "image:valid" }),
    );
  });

  it("lets a retry submit only the failed operation id, reusing it verbatim", async () => {
    const finalized = new Set<string>();
    const deps = makeDeps({
      finalize: async () => {
        throw new Error("finalize down");
      },
    });
    const firstResults = await saveImageOperations(
      [
        { image: img("a"), operationId: "image:op-a" },
        { image: img("b"), operationId: "image:op-b" },
      ],
      deps,
    );
    const failed = firstResults.filter((r) => r.status === "failed");
    expect(failed).toHaveLength(2);

    const retryRequests = failed.map((r) => ({
      image: r.image,
      operationId: r.operationId,
    }));
    expect(retryRequests.map((r) => r.operationId).sort()).toEqual([
      "image:op-a",
      "image:op-b",
    ]);

    const retryDeps = makeDeps({
      finalize: async (input) => {
        finalized.add(input.operationId);
        return `ks_items_${input.operationId}` as never;
      },
    });
    const retryResults = await saveImageOperations(retryRequests, retryDeps);
    expect(retryResults.map((r) => r.status)).toEqual(["saved", "saved"]);
    expect(retryResults.map((r) => r.operationId).sort() as string[]).toEqual([
      "image:op-a",
      "image:op-b",
    ]);
    expect(finalized.has("image:op-a")).toBe(true);
    expect(finalized.has("image:op-b")).toBe(true);
  });

  it("skips the upload when begin reports the operation already complete", async () => {
    const upload = vi.fn(async () => "ks_storage_should_not_run" as never);
    const deps = makeDeps({
      begin: async () => ({
        kind: "complete",
        itemId: "ks_items_existing" as never,
      }),
      upload,
    });
    const results = await saveImageOperations(
      [{ image: img("a"), operationId: "image:op-a" }],
      deps,
    );
    expect(upload).not.toHaveBeenCalled();
    const saved = results[0] as Extract<ImageSaveResult, { status: "saved" }>;
    expect(saved.itemId).toBe("ks_items_existing");
    expect(saved.operationId).toBe("image:op-a");
  });

  it("reports the correct stage when begin fails", async () => {
    const deps = makeDeps({
      begin: async () => {
        throw new Error("begin down");
      },
    });
    const results = await saveImageOperations(
      [{ image: img("a"), operationId: "image:op-a" }],
      deps,
    );
    expect(results[0].status).toBe("failed");
    expect(
      (results[0] as Extract<ImageSaveResult, { status: "failed" }>).stage,
    ).toBe("begin");
  });

  it("reports the correct stage when attach fails", async () => {
    const deps = makeDeps({
      attach: async () => {
        throw new Error("attach down");
      },
    });
    const results = await saveImageOperations(
      [{ image: img("a"), operationId: "image:op-a" }],
      deps,
    );
    expect(
      (results[0] as Extract<ImageSaveResult, { status: "failed" }>).stage,
    ).toBe("attach");
  });

  it("reports the correct stage when finalize fails", async () => {
    const deps = makeDeps({
      finalize: async () => {
        throw new Error("finalize down");
      },
    });
    const results = await saveImageOperations(
      [{ image: img("a"), operationId: "image:op-a" }],
      deps,
    );
    expect(
      (results[0] as Extract<ImageSaveResult, { status: "failed" }>).stage,
    ).toBe("finalize");
  });

  it("sanitizes URLs and ids out of the failure message", async () => {
    const storageId = "kg2e5gqf40sy8kdqxcm3vp7hn96wtxyz";
    const itemId = "jd7bw2mkq4vc9ntxhe6grf8ysm5apqrs";
    const deps = makeDeps({
      upload: async () => {
        throw new Error(
          `POST https://upload.convex.cloud/abc failed for ${storageId} and ${itemId}`,
        );
      },
    });
    const results = await saveImageOperations(
      [{ image: img("a"), operationId: "image:op-a" }],
      deps,
    );
    const failed = results[0] as Extract<ImageSaveResult, { status: "failed" }>;
    expect(failed.message).not.toContain("https://");
    expect(failed.message).not.toContain(storageId);
    expect(failed.message).not.toContain(itemId);
  });

  it("passes image metadata and spaceId through to finalize", async () => {
    const finalizeInputs: unknown[] = [];
    const deps = makeDeps({
      finalize: async (input) => {
        finalizeInputs.push(input);
        return "final-item" as never;
      },
    });
    await saveImageOperations(
      [
        {
          image: {
            uri: "a",
            width: 300,
            height: 200,
            isSticker: true,
            capturedAt: 1234,
            latitude: 12.5,
            longitude: -70.25,
          },
          operationId: "image:op-a",
        },
      ],
      deps,
      { spaceId: "space-1" as never },
    );
    expect(finalizeInputs).toEqual([
      {
        operationId: "image:op-a",
        aspectRatio: 300 / 200,
        isSticker: true,
        capturedAt: 1234,
        latitude: 12.5,
        longitude: -70.25,
        spaceId: "space-1",
      },
    ]);
  });

  it("uploads the normalized file and stores its aspect ratio, failing at the normalize stage", async () => {
    const uploaded: string[] = [];
    const finalizeInputs: { aspectRatio?: number }[] = [];
    const deps = makeDeps({
      normalize: async (image) =>
        image.uri === "bad"
          ? Promise.reject(new Error("decode failed"))
          : { ...image, uri: `${image.uri}-small`, width: 1600, height: 800 },
      upload: async (image) => {
        uploaded.push(image.uri);
        return "ks_storage_uploaded" as never;
      },
      finalize: async (input) => {
        finalizeInputs.push(input);
        return "final-item" as never;
      },
    });
    const results = await saveImageOperations(
      [
        { image: { uri: "a", width: 4000, height: 2000 } },
        { image: img("bad") },
      ],
      deps,
    );
    expect(uploaded).toEqual(["a-small"]);
    expect(finalizeInputs).toEqual([
      expect.objectContaining({ aspectRatio: 2 }),
    ]);
    expect(results[0]).toMatchObject({ status: "saved", image: { uri: "a" } });
    expect(results[1]).toMatchObject({
      status: "failed",
      stage: "normalize",
      message: "decode failed",
    });
  });

  it("runs at most MAX_CONCURRENT_SAVES operations at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const deps = makeDeps({
      upload: async () => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return "ks_storage_uploaded" as never;
      },
    });
    const requests = Array.from({ length: 10 }, (_, i) => ({
      image: img(`img-${i}`),
    }));
    const results = await saveImageOperations(requests, deps);
    expect(peak).toBe(MAX_CONCURRENT_SAVES);
    expect(results.map((r) => r.image.uri)).toEqual(
      requests.map((r) => r.image.uri),
    );
  });

  it("surfaces a ConvexError's data as the message, not the transport string", async () => {
    const { ConvexError } = await import("convex/values");
    const deps = makeDeps({
      begin: async () => {
        throw new ConvexError(
          "Photo limit reached (1,000). Delete some photos to save more.",
        );
      },
    });
    const results = await saveImageOperations([{ image: img("a") }], deps);
    expect(results[0]).toMatchObject({
      status: "failed",
      stage: "begin",
      message: "Photo limit reached (1,000). Delete some photos to save more.",
    });
  });

  it("buckets the server's quota and size refusals, everything else as other", async () => {
    const { ConvexError } = await import("convex/values");
    const { PHOTO_LIMIT_MESSAGE, IMAGE_TOO_LARGE_MESSAGE } =
      await import("@convex/model/imagePolicy");
    const failWith = async (error: unknown) => {
      const deps = makeDeps({
        upload: async () => {
          throw error;
        },
      });
      const [result] = await saveImageOperations([{ image: img("a") }], deps);
      return saveFailureReason(
        (result as Extract<ImageSaveResult, { status: "failed" }>).message,
      );
    };
    expect(await failWith(new ConvexError(PHOTO_LIMIT_MESSAGE))).toBe(
      "photo_limit",
    );
    expect(await failWith(new ConvexError(IMAGE_TOO_LARGE_MESSAGE))).toBe(
      "too_large",
    );
    expect(await failWith(new Error(IMAGE_TOO_LARGE_MESSAGE))).toBe(
      "too_large",
    );
    expect(await failWith(new Error("Upload failed (503)"))).toBe("other");
  });

  it("buckets a structured refusal by its code, not by the sentence", async () => {
    const { saveError } = await import("@convex/model/saveErrors");
    const deps = makeDeps({
      upload: async () => {
        throw saveError("photo_limit");
      },
    });
    const [result] = await saveImageOperations([{ image: img("a") }], deps);
    const failed = result as Extract<ImageSaveResult, { status: "failed" }>;
    expect(failed.code).toBe("photo_limit");
    expect(saveFailureReason("some reworded sentence", failed.code)).toBe(
      "photo_limit",
    );
  });

  it("carries pro_required through so the caller can open the paywall", async () => {
    const { saveError } = await import("@convex/model/saveErrors");
    const deps = makeDeps({
      begin: async () => {
        throw saveError("pro_required");
      },
    });
    const [result] = await saveImageOperations([{ image: img("a") }], deps);
    const failed = result as Extract<ImageSaveResult, { status: "failed" }>;
    expect(failed.code).toBe("pro_required");
    expect(saveFailureReason(failed.message, failed.code)).toBe("other");
  });

  it("reports one images_save_failed event per reason in a mixed batch", async () => {
    const { ConvexError } = await import("convex/values");
    const { PHOTO_LIMIT_MESSAGE, IMAGE_TOO_LARGE_MESSAGE } =
      await import("@convex/model/imagePolicy");
    const errors: Record<string, unknown> = {
      a: new ConvexError(PHOTO_LIMIT_MESSAGE),
      b: new ConvexError(PHOTO_LIMIT_MESSAGE),
      c: new ConvexError(IMAGE_TOO_LARGE_MESSAGE),
    };
    const deps = makeDeps({
      upload: async (image) => {
        if (image.uri in errors) throw errors[image.uri];
        return "ks_storage_uploaded" as never;
      },
    });
    const results = await saveImageOperations(
      ["a", "b", "c", "ok"].map((uri) => ({ image: img(uri) })),
      deps,
    );
    captured.length = 0;
    reportSaveFailures(results);
    expect(captured).toEqual(
      expect.arrayContaining([
        ["images_save_failed", { reason: "photo_limit", image_count: 2 }],
        ["images_save_failed", { reason: "too_large", image_count: 1 }],
      ]),
    );
    expect(captured).toHaveLength(2);
  });

  it("falls back to a generic message when the thrown value is not an Error", async () => {
    const deps = makeDeps({
      upload: async () => {
        throw "raw string failure";
      },
    });
    const results = await saveImageOperations(
      [{ image: img("a"), operationId: "image:op-a" }],
      deps,
    );
    const failed = results[0] as Extract<ImageSaveResult, { status: "failed" }>;
    expect(failed.message).toBe("Could not complete (upload)");
  });
});
