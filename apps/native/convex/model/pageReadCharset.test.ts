import { beforeEach, describe, expect, it, vi } from "vitest";

import { readPage } from "./pageRead";

// A page served as a bare `text/html` (no charset on the wire) that declares
// its charset only in the HTML must be decoded as that charset, not UTF-8:
// otherwise a Shift_JIS or windows-1251 page gets a mojibake title ("����")
// that reaches the classifier prompt, the embedding and searchText.

const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("./safeFetch", async (original) => ({
  ...(await original<typeof import("./safeFetch")>()),
  safeFetch,
}));

function bytes(...parts: (string | number[])[]): Uint8Array {
  const chunks = parts.map((part) =>
    typeof part === "string"
      ? new TextEncoder().encode(part)
      : Uint8Array.from(part),
  );
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** "東京" in Shift_JIS. */
const TOKYO_SJIS = [0x93, 0x8c, 0x8b, 0x9e];
/** "Привет" in windows-1251. */
const PRIVET_CP1251 = [0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2];

function page(url: string, body: Uint8Array) {
  safeFetch.mockResolvedValue({
    ok: true,
    finalUrl: url,
    status: 200,
    // No charset on the wire: the page itself says what it is.
    contentType: "text/html",
    bytes: body,
  });
}

beforeEach(() => {
  safeFetch.mockReset();
});

describe("a page that names its charset only in its HTML", () => {
  it("reads a Shift_JIS title declared with <meta charset>", async () => {
    const url = "https://example.jp/tokyo";
    page(
      url,
      bytes(
        '<html><head><meta charset="Shift_JIS"><title>',
        TOKYO_SJIS,
        "</title></head><body><p>",
        TOKYO_SJIS,
        "</p></body></html>",
      ),
    );

    const read = await readPage(url);

    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.page.title).toBe("東京");
    expect(read.page.title).not.toContain("�");
  });

  it("reads a windows-1251 title declared with http-equiv Content-Type", async () => {
    const url = "https://example.ru/privet";
    page(
      url,
      bytes(
        '<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1251"><title>',
        PRIVET_CP1251,
        "</title></head><body><p>",
        PRIVET_CP1251,
        "</p></body></html>",
      ),
    );

    const read = await readPage(url);

    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.page.title).toBe("Привет");
    expect(read.page.title).not.toContain("�");
  });
});
