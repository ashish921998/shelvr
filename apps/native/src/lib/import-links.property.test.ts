import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  IMPORT_BATCH_SIZE,
  importInBatches,
  parseImportText,
  type ImportBatchResult,
} from "./import-links";

/** The scheme and host of a link: the part where case does not matter. */
const AUTHORITY = /^[a-z]+:\/\/[^/?#]*/i;

/** A pasted list: real-looking links, some repeated, some with the host in
 * another case, which is still the same link. */
const pastedLinks = fc
  .array(fc.webUrl({ withQueryParameters: true, withFragments: true }), {
    maxLength: 30,
  })
  .chain((urls) =>
    fc
      .shuffledSubarray(urls)
      .map((repeats) => [
        ...urls,
        ...repeats.map((url) => url.replace(AUTHORITY, (a) => a.toUpperCase())),
      ]),
  );

/** Scheme and host in lower case, the rest as written: what makes two pasted
 * links the same link. */
function sameLinkKey(url: string): string {
  return url.replace(AUTHORITY, (a) => a.toLowerCase());
}

describe("parseImportText", () => {
  it("keeps the first copy of every link, in order, and no second copy", () => {
    fc.assert(
      fc.property(pastedLinks, (urls) => {
        const parsed = parseImportText(urls.join("\n"));
        const keys = urls.map(sameLinkKey);
        expect(parsed).toEqual(
          urls.filter((_, index) => keys.indexOf(keys[index]) === index),
        );
      }),
    );
  });

  it("reads the same list from every format the import accepts", () => {
    fc.assert(
      fc.property(
        pastedLinks,
        fc.constantFrom(" ", "\n", "\r\n", "\t", " \n "),
        (urls, gap) => {
          const expected = parseImportText(urls.join("\n"));
          const json = JSON.stringify(urls);
          expect(parseImportText(`  ${urls.join(gap)}\n`)).toEqual(expected);
          expect(parseImportText(json)).toEqual(expected);
          expect(
            parseImportText(JSON.stringify(urls.map((url) => ({ url })))),
          ).toEqual(expected);
          expect(
            parseImportText(JSON.stringify(urls.map((link) => ({ link })))),
          ).toEqual(expected);
          expect(
            parseImportText(`window.YTD.bookmarks.part0 = ${json}`),
          ).toEqual(expected);
        },
      ),
    );
  });

  it("gives the same list back when its own output is pasted again", () => {
    fc.assert(
      fc.property(pastedLinks, (urls) => {
        const once = parseImportText(urls.join(" "));
        expect(parseImportText(once.join("\n"))).toEqual(once);
      }),
    );
  });

  it("never throws and never returns a blank or repeated entry", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json()), (text) => {
        const parsed = parseImportText(text);
        expect(new Set(parsed).size).toBe(parsed.length);
        for (const entry of parsed) expect(entry.trim()).not.toBe("");
      }),
    );
  });
});

/** How the server answers one batch. The shares split the batch between
 * created, skipped and invalid, as the real mutation does. */
const batchAnswer = fc.record({
  kind: fc.constantFrom("ok", "ok", "ok", "rate_limited", "throws"),
  skippedShare: fc.double({ min: 0, max: 1, noNaN: true }),
  invalidShare: fc.double({ min: 0, max: 1, noNaN: true }),
});

describe("importInBatches", () => {
  it("accounts for every link exactly once, however the import ends", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 400 }),
        fc.array(batchAnswer, { minLength: 9, maxLength: 9 }),
        async (count, answers) => {
          const urls = Array.from(
            { length: count },
            (_, i) => `https://example.com/${i}`,
          );
          const sent: string[] = [];
          let created = 0;
          let stopped = false;

          const summary = await importInBatches(
            urls,
            (batch, staggerOffset) => {
              // Nothing is sent after the server said stop.
              expect(stopped).toBe(false);
              expect(batch.length).toBeGreaterThan(0);
              expect(batch.length).toBeLessThanOrEqual(IMPORT_BATCH_SIZE);
              // Processing staggers on from the links created so far.
              expect(staggerOffset).toBe(created);
              const answer = answers[sent.length / IMPORT_BATCH_SIZE];
              sent.push(...batch);
              if (answer.kind === "throws") {
                stopped = true;
                return Promise.reject(new Error("network"));
              }
              const skipped = Math.floor(batch.length * answer.skippedShare);
              const invalid = Math.floor(
                (batch.length - skipped) * answer.invalidShare,
              );
              const rest = batch.length - skipped - invalid;
              const rateLimited = answer.kind === "rate_limited";
              if (rateLimited) stopped = true;
              else created += rest;
              const result: ImportBatchResult = {
                created: rateLimited ? 0 : rest,
                skipped,
                invalid,
                notProcessed: rateLimited ? rest : 0,
                rateLimited,
              };
              return Promise.resolve(result);
            },
          );

          // Batches go out in order with no link skipped or sent twice.
          expect(sent).toEqual(urls.slice(0, sent.length));
          expect(
            summary.created +
              summary.skipped +
              summary.invalid +
              summary.notProcessed,
          ).toBe(count);
          expect(summary.created).toBe(created);
          expect(summary.stopped !== null).toBe(stopped);
          if (!stopped) {
            expect(sent).toHaveLength(count);
            expect(summary.notProcessed).toBe(0);
          }
        },
      ),
    );
  });
});
