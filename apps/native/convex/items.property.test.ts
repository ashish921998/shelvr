// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { saveErrorCode } from "./model/saveErrors";

type TestCtx = TestConvexForDataModel<DataModel>;

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 12);

// Scheduled jobs stay queued (see items.test.ts), and the clock is pinned so
// "expired" means the same thing on every run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const USERS = ["user-a", "user-b"] as const;
type User = (typeof USERS)[number];

function signedIn(
  base: ReturnType<typeof newConvexTest>,
): Record<User, TestCtx> {
  return {
    "user-a": base.withIdentity({ subject: "user-a|session-1" }),
    "user-b": base.withIdentity({ subject: "user-b|session-1" }),
  };
}

async function seedPro(t: TestCtx, userId: string): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("subscriptions", {
      userId,
      status: "pro",
      expiresAt: NOW + 365 * DAY_MS,
      updatedAt: NOW,
    });
  });
}

async function snapshot(t: TestCtx) {
  return await t.run(async (ctx) => ({
    items: await ctx.db.query("items").collect(),
    operations: await ctx.db.query("itemOperations").collect(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

// A few operation ids shared by every command, so retries, a retry of the
// other kind, and the other user's use of the same id all happen often.
const operationId = fc.option(
  fc.integer({ min: 0, max: 3 }).map((n) => `share:operation-${n}`),
  { nil: undefined },
);
const command = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      do: fc.constantFrom("link" as const, "note" as const),
      user: fc.constantFrom(...USERS),
      operationId,
      content: fc.integer({ min: 0, max: 2 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      do: fc.constant("delete" as const),
      user: fc.constantFrom(...USERS),
      pick: fc.nat(),
    }),
  },
);

describe("saving links and notes", () => {
  it("makes one save per operation, whatever is retried, mixed up or deleted", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 20 commands stay under one user's itemCreate burst of 30.
        fc.array(command, { maxLength: 20 }),
        async (commands) => {
          const base = newConvexTest();
          const as = signedIn(base);
          for (const user of USERS) await seedPro(base, user);

          // What should exist: each user's saves, and which save each of
          // their operation ids produced.
          const saves = new Map<Id<"items">, { user: User; kind: string }>();
          const operations = new Map<
            string,
            { kind: string; itemId: Id<"items"> }
          >();
          // Every save ever made, deleted ones included.
          const everSaved: Id<"items">[] = [];

          for (const step of commands) {
            const t = as[step.user];
            if (step.do === "delete") {
              const mine = [...saves].filter(([, s]) => s.user === step.user);
              if (mine.length === 0) continue;
              const [itemId] = mine[step.pick % mine.length];
              await t.mutation(api.items.deleteItem, { id: itemId });
              saves.delete(itemId);
              // A deleted save frees its operation id for a fresh save.
              for (const [key, op] of operations) {
                if (op.itemId === itemId) operations.delete(key);
              }
              continue;
            }

            const key = `${step.user}/${step.operationId}`;
            const earlier =
              step.operationId === undefined ? undefined : operations.get(key);
            const save =
              step.do === "link"
                ? t.mutation(api.items.createLinkItem, {
                    url: `https://example.com/${step.content}`,
                    operationId: step.operationId,
                  })
                : t.mutation(api.items.createNoteItem, {
                    text: `note ${step.content}`,
                    operationId: step.operationId,
                  });

            if (earlier !== undefined && earlier.kind !== step.do) {
              // The id already names a save of the other kind.
              await expect(save).rejects.toThrow("Operation kind mismatch");
              continue;
            }
            const itemId = await save;
            if (earlier !== undefined) {
              // A retry gets the save it already made.
              expect(itemId).toBe(earlier.itemId);
              continue;
            }
            expect(saves.has(itemId)).toBe(false);
            saves.set(itemId, { user: step.user, kind: step.do });
            everSaved.push(itemId);
            if (step.operationId !== undefined) {
              operations.set(key, { kind: step.do, itemId });
            }
          }

          const stored = await snapshot(base);
          expect(
            new Map(
              stored.items.map((item) => [
                item._id,
                { user: item.userId, kind: item.type },
              ]),
            ),
          ).toEqual(saves);
          expect(
            new Map(
              stored.operations.map((op) => [
                `${op.userId}/${op.operationId}`,
                { kind: op.kind, itemId: op.itemId },
              ]),
            ),
          ).toEqual(operations);
          expect(
            stored.operations.every((op) => op.status === "complete"),
          ).toBe(true);
          // No operation id has two ledger rows, which the map above would
          // have folded into one.
          expect(stored.operations).toHaveLength(operations.size);
          // Each save was sent for processing once, and a retry never sends
          // it again.
          expect(
            stored.jobs
              .filter((job) => job.name === "ai:processItem")
              .map((job) => (job.args[0] as { itemId: string }).itemId)
              .sort(),
          ).toEqual([...everSaved].sort());
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// The Pro gate
// ---------------------------------------------------------------------------

const subscription = fc.option(
  fc.record({
    status: fc.constantFrom(
      "trialing" as const,
      "pro" as const,
      "lapsed" as const,
      "lifetime" as const,
    ),
    // Around the pinned clock, with the edges on both sides of "now".
    expiresAt: fc.oneof(
      fc.constantFrom(NOW - 1, NOW, NOW + 1),
      fc.integer({ min: NOW - 30 * DAY_MS, max: NOW + 30 * DAY_MS }),
    ),
  }),
  { nil: null },
);

describe("the Pro gate on saves", () => {
  it("lets a save through only on a live trial, subscription or lifetime plan, and stores nothing otherwise", async () => {
    await fc.assert(
      fc.asyncProperty(subscription, async (sub) => {
        const base = newConvexTest();
        const t = signedIn(base)["user-a"];
        if (sub !== null) {
          await base.run(async (ctx) => {
            await ctx.db.insert("subscriptions", {
              userId: "user-a",
              ...sub,
              updatedAt: NOW,
            });
          });
        }
        // Written out here, not taken from the gate's own helper.
        const allowed =
          sub !== null &&
          (sub.status === "lifetime" ||
            ((sub.status === "trialing" || sub.status === "pro") &&
              sub.expiresAt > NOW));

        const attempts = [
          () =>
            t.mutation(api.items.createLinkItem, {
              url: "https://example.com/a",
              operationId: "share:operation-link",
            }),
          () =>
            t.mutation(api.items.createNoteItem, {
              text: "a note",
              operationId: "share:operation-note",
            }),
          () =>
            t.mutation(api.items.importLinks, {
              urls: ["https://example.com/b"],
            }),
        ];
        for (const attempt of attempts) {
          if (allowed) {
            await attempt();
          } else {
            const error = await attempt().then(
              () => undefined,
              (thrown: unknown) => thrown,
            );
            expect(saveErrorCode(error)).toBe("pro_required");
          }
        }

        const stored = await snapshot(base);
        expect(stored.items).toHaveLength(allowed ? 3 : 0);
        if (!allowed) {
          expect(stored.operations).toHaveLength(0);
          expect(stored.jobs).toHaveLength(0);
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// Words none of which starts another, so which saves a word finds is plain.
const WORDS = ["ramen", "tower", "craft", "lisbon", "checklist", "sourdough"];
const savedTitle = fc
  .subarray(WORDS, { minLength: 1, maxLength: 3 })
  .chain((words) => fc.shuffledSubarray(words, { minLength: words.length }));
const typed = fc
  .tuple(
    fc.constantFrom(...WORDS),
    fc.boolean(),
    fc.constantFrom("", " ", "  \n"),
  )
  .map(([word, upper, padding]) => ({
    word,
    text: `${padding}${upper ? word.toUpperCase() : word}${padding}`,
  }));

/** Saves a link and finishes it the way the processing pipeline does. */
async function saveFinished(
  base: TestCtx,
  t: TestCtx,
  url: string,
  title: string[],
): Promise<Id<"items">> {
  const itemId = await t.mutation(api.items.createLinkItem, { url });
  const item = await base.run((ctx) => ctx.db.get(itemId));
  await base.mutation(internal.items.finalizeItem, {
    itemId,
    runId: item?.processingRunId,
    title: title.join(" "),
    description: "",
    tags: [],
    status: "ready",
  });
  return itemId;
}

describe("searching saves", () => {
  it("finds every one of your saves with the word, and never anyone else's", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(savedTitle, { minLength: 1, maxLength: 6 }),
        typed,
        async (titles, query) => {
          const base = newConvexTest();
          const as = signedIn(base);
          for (const user of USERS) await seedPro(base, user);

          // Both users save the same titles, so only ownership tells their
          // saves apart.
          const mine = new Map<Id<"items">, string[]>();
          for (const [index, title] of titles.entries()) {
            const url = `https://example.com/${index}`;
            mine.set(await saveFinished(base, as["user-a"], url, title), title);
            await saveFinished(base, as["user-b"], url, title);
          }

          const found = await as["user-a"].query(api.items.searchItems, {
            query: query.text,
          });
          expect(found.map((item) => item._id).sort()).toEqual(
            [...mine]
              .filter(([, title]) => title.includes(query.word))
              .map(([itemId]) => itemId)
              .sort(),
          );
          expect(found.every((item) => item.userId === "user-a")).toBe(true);
        },
      ),
    );
  });

  it("returns nothing for a blank search", async () => {
    const base = newConvexTest();
    const t = signedIn(base)["user-a"];
    await seedPro(base, "user-a");
    await saveFinished(base, t, "https://example.com/a", ["ramen"]);

    await fc.assert(
      fc.asyncProperty(
        fc
          .array(fc.constantFrom(" ", "\t", "\n", " "), { maxLength: 6 })
          .map((spaces) => spaces.join("")),
        async (blank) => {
          expect(
            await t.query(api.items.searchItems, { query: blank }),
          ).toEqual([]);
        },
      ),
    );
  });
});
