import { describe, expect, it, vi } from "vitest";
import {
  IMPORT_BATCH_SIZE,
  importInBatches,
  parseImportText,
  type ImportBatchResult,
} from "./import-links";

describe("parseImportText", () => {
  it("splits plain text on whitespace and keeps commas inside URLs", () => {
    expect(
      parseImportText("https://a.example/x?q=1,2\n  https://b.example "),
    ).toEqual(["https://a.example/x?q=1,2", "https://b.example"]);
  });

  it("reads strings, url/link fields, and archive bookmarks from JSON", () => {
    const json = JSON.stringify([
      "https://a.example",
      { url: "https://b.example" },
      { link: "https://c.example" },
      { url: null },
      { bookmark: { tweetId: "1747678091936260416" } },
      { bookmark: { tweetId: 42 } },
      { bookmark: { tweetId: "12ab" } },
    ]);
    expect(parseImportText(json)).toEqual([
      "https://a.example",
      "https://b.example",
      "https://c.example",
      "https://x.com/i/web/status/1747678091936260416",
    ]);
  });

  it("accepts the archive file with its window.YTD assignment", () => {
    const file = `window.YTD.bookmarks.part0 = [{"bookmark":{"tweetId":"123"}}]`;
    expect(parseImportText(file)).toEqual(["https://x.com/i/web/status/123"]);
  });

  it("dedupes on case-insensitive host but case-sensitive path", () => {
    expect(
      parseImportText(
        "https://EXAMPLE.com/Docs https://example.com/Docs https://example.com/docs",
      ),
    ).toEqual(["https://EXAMPLE.com/Docs", "https://example.com/docs"]);
    expect(parseImportText("   ")).toEqual([]);
    expect(parseImportText('{"url":"https://a.example"}')).toEqual([]);
  });
});

const ok = (created: number): ImportBatchResult => ({
  created,
  skipped: 0,
  invalid: 0,
  notProcessed: 0,
  rateLimited: false,
});

const urls = (count: number) =>
  Array.from({ length: count }, (_, i) => `https://example.com/${i}`);

describe("importInBatches", () => {
  it("pages in server-sized batches and carries the stagger offset", async () => {
    const importBatch = vi.fn<
      (batch: string[], offset: number) => Promise<ImportBatchResult>
    >(async (batch) => ({ ...ok(batch.length - 1), skipped: 1 }));
    const summary = await importInBatches(urls(120), importBatch);
    expect(
      importBatch.mock.calls.map(([b, offset]) => [b.length, offset]),
    ).toEqual([
      [IMPORT_BATCH_SIZE, 0],
      [IMPORT_BATCH_SIZE, 49],
      [20, 98],
    ]);
    expect(summary).toEqual({
      created: 117,
      skipped: 3,
      invalid: 0,
      notProcessed: 0,
      stopped: null,
    });
  });

  it("stops at the rate limit and counts the rest as not processed", async () => {
    const importBatch = vi
      .fn<(batch: string[], offset: number) => Promise<ImportBatchResult>>()
      .mockResolvedValueOnce(ok(50))
      .mockResolvedValueOnce({
        created: 0,
        skipped: 5,
        invalid: 1,
        notProcessed: 44,
        rateLimited: true,
      });
    const summary = await importInBatches(urls(130), importBatch);
    expect(importBatch).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({
      created: 50,
      skipped: 5,
      invalid: 1,
      notProcessed: 44 + 30,
      stopped: "rate_limited",
    });
  });

  it("stops when a batch throws and keeps what earlier batches created", async () => {
    const failure = new Error("offline");
    const importBatch = vi
      .fn<(batch: string[], offset: number) => Promise<ImportBatchResult>>()
      .mockResolvedValueOnce(ok(50))
      .mockRejectedValueOnce(failure);
    const summary = await importInBatches(urls(120), importBatch);
    expect(summary).toEqual({
      created: 50,
      skipped: 0,
      invalid: 0,
      notProcessed: 70,
      stopped: "failed",
      error: failure,
    });
  });
});
