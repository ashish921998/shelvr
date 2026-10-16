// @vitest-environment jsdom
// Tests for the useSaveImages adapter's upload step. The `/image-upload`
// receiver (convex/http.ts) answers a refusal with `{error: <code>}` and a
// status: 402 `pro_required`, 413 / 422 `image_too_large` | `image_empty`,
// 429 `rate_limited`. A refusal carrying a save error code must settle with
// that `code`, so the batch alert, the paywall route and the queued Siri save
// branch on it; every other refusal stays a plain, retryable failure.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSaveImages, type ImageSaveResult } from "./use-save-image";

type FakeResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const mock = vi.hoisted(() => ({
  response: undefined as unknown,
  fetch: vi.fn(),
  mutations: {
    begin: vi.fn(async () => ({
      kind: "upload" as const,
      uploadUrl: "https://example.convex.site/image-upload?token=abc",
    })),
    attach: vi.fn(async (args: { storageId: string }) => ({
      storageId: args.storageId,
    })),
    finalize: vi.fn(async () => "item_1"),
  },
}));

vi.mock("expo-file-system", () => ({
  File: class {
    size = 1024;
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));
vi.mock("@/lib/normalize-image", () => ({
  normalizeImage: async (image: unknown) => image,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { sessionId: () => undefined, capture: vi.fn() },
}));
vi.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => mock.fetch(...args),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));
vi.mock("@convex/_generated/api", () => ({
  api: {
    items: {
      beginImageImport: "begin",
      attachImageUpload: "attach",
      finalizeImageImport: "finalize",
    },
  },
}));
vi.mock("@convex/_generated/dataModel", () => ({}));
vi.mock("convex/react", () => ({
  useMutation: (ref: keyof typeof mock.mutations) => mock.mutations[ref],
}));

type Failed = Extract<ImageSaveResult, { status: "failed" }>;

async function saveOne(response: FakeResponse): Promise<Failed> {
  mock.response = response;
  const { result } = renderHook(() => useSaveImages());
  const results = await result.current([
    { image: { uri: "file:///tmp/a.jpg", mimeType: "image/jpeg" } },
  ]);
  expect(results[0].status).toBe("failed");
  const failed = results[0] as Failed;
  expect(failed.stage).toBe("upload");
  return failed;
}

beforeEach(() => {
  mock.fetch.mockReset();
  mock.fetch.mockImplementation(async () => mock.response);
  mock.mutations.attach.mockClear();
});

describe("useSaveImages upload refusals", () => {
  it("surfaces a 402 pro_required from the upload receiver as a coded failure", async () => {
    const failed = await saveOne({
      ok: false,
      status: 402,
      json: async () => ({ error: "pro_required" }),
    });
    expect(failed.code).toBe("pro_required");
    expect(mock.mutations.attach).not.toHaveBeenCalled();
  });

  it("surfaces a 413 image_too_large from the upload receiver as a coded failure", async () => {
    const failed = await saveOne({
      ok: false,
      status: 413,
      json: async () => ({ error: "image_too_large" }),
    });
    expect(failed.code).toBe("image_too_large");
  });

  it("surfaces a 422 image_empty from the upload receiver as a coded failure", async () => {
    const failed = await saveOne({
      ok: false,
      status: 422,
      json: async () => ({ error: "image_empty" }),
    });
    expect(failed.code).toBe("image_empty");
  });

  it("keeps a 429 busy refusal code-less so the caller retries it", async () => {
    const failed = await saveOne({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate_limited" }),
    });
    expect(failed.code).toBeUndefined();
    expect(failed.message).toBe("Upload failed (429)");
  });

  it("keeps a 5xx with an unparseable body code-less", async () => {
    const failed = await saveOne({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });
    expect(failed.code).toBeUndefined();
    expect(failed.message).toBe("Upload failed (502)");
  });

  it("keeps a non-object body code-less", async () => {
    const failed = await saveOne({
      ok: false,
      status: 500,
      json: async () => null,
    });
    expect(failed.code).toBeUndefined();
    expect(failed.message).toBe("Upload failed (500)");
  });
});
