// Tests for the pure saveImageOperations orchestration. The React/Convex
// adapter (useSaveImages) and the expo modules it imports are not exercised
// here — only the dependency-injected orchestration, which is where the
// per-image settled-result contract lives. Runs in the Node default env.
import {
  MAX_CONCURRENT_SAVES,
  saveFailureReason,
  saveImageOperations,
  type ImageSaveResult,
  type SaveImageDeps,
} from "./use-save-image";
import { describe, expect, it, vi } from "vitest";

// Stub the expo modules the module under test imports at the top level, so it
// loads under Node without a React Native runtime. Vitest hoists these mocks
// above the imports above, so the module under test sees the stubs at load
// time. Only the orchestration (which receives its deps as arguments) is
// exercised.
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("@/lib/normalize-image", () => ({ normalizeImage: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ analytics: { sessionId: () => undefined } }));
vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("expo-crypto", () => {
  // A counter (not a constant) so tests can assert each image in a batch mints
  // a DISTINCT operation id — a constant stub would hide an id-reuse bug that
  // collapses a whole batch into one backend operation.
  let n = 0;
  return { randomUUID: () => `stub-uuid-${++n}` };
});
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@convex/_generated/dataModel", () => ({}));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));

// Build a deps object from per-stage behaviors. Each stage is an async fn so a
// test can make a specific stage throw to assert the reported failure stage.
function makeDeps(overrides: Partial<SaveImageDeps> = {}): SaveImageDeps {
  return {
    begin: overrides.begin ?? (async () => ({ kind: "upload", uploadUrl: "https://upload.test" })),
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
    // Results follow input order even though tasks run concurrently.
    expect((results[0] as Extract<ImageSaveResult, { status: "saved" }>).image.uri).toBe("a");
    expect((results[2] as Extract<ImageSaveResult, { status: "saved" }>).image.uri).toBe("c");
    // Each result carries the operation id it minted — and every image in the
    // batch gets its own distinct id.
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
    // A sanitized message, not a stack trace.
    expect(failed.message).toBe("boom");
  });

  it("reports a soft attach rejection and finalizes only successful siblings", async () => {
    const finalize = vi.fn<SaveImageDeps["finalize"]>(async () => "ks_items_final" as never);
    const deps = makeDeps({
      attach: async (operationId, storageId) => operationId === "image:rejected"
        ? { storageId, error: "This photo is empty. Please save it again." }
        : { storageId },
      finalize,
    });
    const results = await saveImageOperations([
      { image: img("empty"), operationId: "image:rejected" },
      { image: img("valid"), operationId: "image:valid" },
    ], deps);
    expect(results[0]).toEqual({
      status: "failed", operationId: "image:rejected", image: img("empty"),
      stage: "attach", message: "This photo is empty. Please save it again.",
    });
    expect(results[1].status).toBe("saved");
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ operationId: "image:valid" }));
  });

  it("lets a retry submit only the failed operation id, reusing it verbatim", async () => {
    // First pass: finalize is down, so every request fails at that stage.
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

    // The caller retries ONLY the failed results, passing their existing op ids.
    // No new id is minted for a retry.
    const retryRequests = failed.map((r) => ({
      image: r.image,
      operationId: r.operationId,
    }));
    expect(retryRequests.map((r) => r.operationId).sort()).toEqual([
      "image:op-a",
      "image:op-b",
    ]);

    // Second pass with a working finalize: the same op ids come back saved.
    const retryDeps = makeDeps({
      finalize: async (input) => {
        finalized.add(input.operationId);
        return `ks_items_${input.operationId}` as never;
      },
    });
    const retryResults = await saveImageOperations(retryRequests, retryDeps);
    expect(retryResults.map((r) => r.status)).toEqual(["saved", "saved"]);
    expect(
      (retryResults.map((r) => r.operationId).sort() as string[]),
    ).toEqual(["image:op-a", "image:op-b"]);
    expect(finalized.has("image:op-a")).toBe(true);
    expect(finalized.has("image:op-b")).toBe(true);
  });

  it("skips the upload when begin reports the operation already complete", async () => {
    const upload = vi.fn(async () => "ks_storage_should_not_run" as never);
    const deps = makeDeps({
      begin: async () => ({ kind: "complete", itemId: "ks_items_existing" as never }),
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
    const deps = makeDeps({ begin: async () => {
      throw new Error("begin down");
    } });
    const results = await saveImageOperations(
      [{ image: img("a"), operationId: "image:op-a" }],
      deps,
    );
    expect(results[0].status).toBe("failed");
    expect((results[0] as Extract<ImageSaveResult, { status: "failed" }>).stage).toBe("begin");
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
    expect((results[0] as Extract<ImageSaveResult, { status: "failed" }>).stage).toBe("attach");
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
    expect((results[0] as Extract<ImageSaveResult, { status: "failed" }>).stage).toBe("finalize");
  });

  it("sanitizes URLs and ids out of the failure message", async () => {
    // Realistic Convex ids: long unbroken lowercase-alphanumeric tokens, no
    // underscore prefix (the earlier ks_/kg_ fixtures matched nothing real).
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
    // A regression that drops spaceId (image filed to the wrong space) or
    // aspectRatio/isSticker/capturedAt/location must not pass silently.
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
      [{ image: { uri: "a", width: 4000, height: 2000 } }, { image: img("bad") }],
      deps,
    );
    expect(uploaded).toEqual(["a-small"]);
    expect(finalizeInputs).toEqual([expect.objectContaining({ aspectRatio: 2 })]);
    // The result still carries the original so a retry re-normalizes from it.
    expect(results[0]).toMatchObject({ status: "saved", image: { uri: "a" } });
    expect(results[1]).toMatchObject({ status: "failed", stage: "normalize", message: "decode failed" });
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
    const requests = Array.from({ length: 10 }, (_, i) => ({ image: img(`img-${i}`) }));
    const results = await saveImageOperations(requests, deps);
    expect(peak).toBe(MAX_CONCURRENT_SAVES);
    expect(results.map((r) => r.image.uri)).toEqual(requests.map((r) => r.image.uri));
  });

  it("surfaces a ConvexError's data as the message, not the transport string", async () => {
    const { ConvexError } = await import("convex/values");
    const deps = makeDeps({
      begin: async () => {
        throw new ConvexError("Photo limit reached (1,000). Delete some photos to save more.");
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
    const { PHOTO_LIMIT_MESSAGE, IMAGE_TOO_LARGE_MESSAGE } = await import("@convex/model/imagePolicy");
    // Server refusals arrive as ConvexError; client-side failures as plain Error.
    const failWith = async (error: unknown) => {
      const deps = makeDeps({ upload: async () => { throw error; } });
      const [result] = await saveImageOperations([{ image: img("a") }], deps);
      return saveFailureReason((result as Extract<ImageSaveResult, { status: "failed" }>).message);
    };
    expect(await failWith(new ConvexError(PHOTO_LIMIT_MESSAGE))).toBe("photo_limit");
    expect(await failWith(new ConvexError(IMAGE_TOO_LARGE_MESSAGE))).toBe("too_large");
    expect(await failWith(new Error(IMAGE_TOO_LARGE_MESSAGE))).toBe("too_large");
    expect(await failWith(new Error("Upload failed (503)"))).toBe("other");
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
