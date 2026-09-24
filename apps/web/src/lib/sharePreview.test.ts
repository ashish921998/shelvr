import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSharePreview } from "./sharePreview";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("fetchSharePreview", () => {
  it("returns undefined when Convex isn't configured", async () => {
    delete process.env.CONVEX_SITE_URL;
    delete process.env.CONVEX_URL;

    expect(await fetchSharePreview("abc")).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("derives the .convex.site host from CONVEX_URL and fetches the share link", async () => {
    delete process.env.CONVEX_SITE_URL;
    process.env.CONVEX_URL = "https://deployment.convex.cloud";
    const preview = { type: "link", title: "A save" };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(preview), { status: 200 }),
    );

    const result = await fetchSharePreview("abc123");

    expect(fetch).toHaveBeenCalledWith(
      "https://deployment.convex.site/share/links/abc123",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result).toEqual(preview);
  });

  it("returns undefined on a non-ok response or a network failure", async () => {
    process.env.CONVEX_SITE_URL = "https://deployment.convex.site";
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await fetchSharePreview("missing")).toBeUndefined();

    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    expect(await fetchSharePreview("abc")).toBeUndefined();
  });
});
