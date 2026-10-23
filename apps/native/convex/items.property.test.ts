// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest, signedInUser } from "./test.setup";

import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { saveErrorCode } from "./model/saveErrors";

type TestCtx = TestConvexForDataModel<DataModel>;

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 12);
const SLOW_PROPERTY_RUNS = 30;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const USERS = ["user-a", "user-b"] as const;
type User = (typeof USERS)[number];

type SignedIn = {
  as: Record<User, TestCtx>;
  ids: Record<User, Id<"users">>;
  nameOf: (userId: string) => User | undefined;
};

async function signedIn(
  base: ReturnType<typeof newConvexTest>,
  options: { pro?: boolean } = {},
): Promise<SignedIn> {
  const a = await signedInUser(base, options);
  const b = await signedInUser(base, options);
  const ids = { "user-a": a.userId, "user-b": b.userId };
  return {
    as: { "user-a": a.t, "user-b": b.t },
    ids,
    nameOf: (userId) => USERS.find((user) => ids[user] === userId),
  };
}

async function snapshot(t: TestCtx) {
  return await t.run(async (ctx) => ({
    items: await ctx.db.query("items").collect(),
    operations: await ctx.db.query("itemOperations").collect(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

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

type Saves = Map<Id<"items">, { user: User; kind: string }>;
type Operations = Map<string, { kind: string; itemId: Id<"items"> }>;

async function deleteOneSave(
  t: TestCtx,
  step: { user: User; pick: number },
  saves: Saves,
  operations: Operations,
): Promise<void> {
  const mine = [...saves].filter(([, s]) => s.user === step.user);
  if (mine.length === 0) return;
  const [itemId] = mine[step.pick % mine.length]!;
  await t.mutation(api.items.deleteItem, { id: itemId });
  saves.delete(itemId);
  for (const [key, op] of operations) {
    if (op.itemId === itemId) operations.delete(key);
  }
}

describe("saving links and notes", () => {
  it("makes one save per operation, whatever is retried, mixed up or deleted", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(command, { maxLength: 20 }),
        async (commands) => {
          const base = newConvexTest();
          const { as, nameOf } = await signedIn(base, { pro: true });

          const saves: Saves = new Map();
          const operations: Operations = new Map();
          const everSaved: Id<"items">[] = [];

          for (const step of commands) {
            const t = as[step.user];
            if (step.do === "delete") {
              await deleteOneSave(t, step, saves, operations);
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
              await expect(save).rejects.toThrow("Operation kind mismatch");
              continue;
            }
            const itemId = await save;
            if (earlier !== undefined) {
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
                { user: nameOf(item.userId), kind: item.type },
              ]),
            ),
          ).toEqual(saves);
          expect(
            new Map(
              stored.operations.map((op) => [
                `${nameOf(op.userId)}/${op.operationId}`,
                { kind: op.kind, itemId: op.itemId },
              ]),
            ),
          ).toEqual(operations);
          expect(
            stored.operations.every((op) => op.status === "complete"),
          ).toBe(true);
          expect(stored.operations).toHaveLength(operations.size);
          expect(
            stored.jobs
              .filter((job) => job.name === "ai:processItem")
              .map((job) => (job.args[0] as { itemId: string }).itemId)
              .sort(),
          ).toEqual([...everSaved].sort());
        },
      ),
      { numRuns: SLOW_PROPERTY_RUNS },
    );
  });
});

type Sub = {
  status: "trialing" | "pro" | "lapsed" | "lifetime";
  expiresAt: number;
} | null;

const EXPIRIES: [string, number][] = [
  ["30 days ago", -30 * DAY_MS],
  ["a day ago", -DAY_MS],
  ["1 ms ago", -1],
  ["now", 0],
  ["in 1 ms", 1],
  ["in a day", DAY_MS],
  ["in 30 days", 30 * DAY_MS],
];

const SUBS: [string, Sub][] = [
  ["no subscription", null],
  ...(["trialing", "pro", "lapsed", "lifetime"] as const).flatMap(
    (status): [string, Sub][] =>
      EXPIRIES.map(([when, offset]) => [
        `${status}, expires ${when}`,
        { status, expiresAt: NOW + offset },
      ]),
  ),
];

describe("the Pro gate on saves", () => {
  it.each(SUBS)(
    "lets a save through only on a live trial, subscription or lifetime plan: %s",
    async (_label, sub) => {
      const base = newConvexTest();
      const { as, ids } = await signedIn(base);
      const t = as["user-a"];
      if (sub !== null) {
        await base.run(async (ctx) => {
          await ctx.db.insert("subscriptions", {
            userId: ids["user-a"],
            ...sub,
            updatedAt: NOW,
          });
        });
      }
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
    },
  );
});

const WORDS = ["ramen", "tower", "craft", "lisbon", "checklist", "sourdough"];
const savedTitle = fc
  .subarray(WORDS, { minLength: 1, maxLength: 3 })
  .chain((words) => fc.shuffledSubarray(words, { minLength: words.length }));
const spelling = fc.record({
  upper: fc.boolean(),
  padding: fc.constantFrom("", " ", "  \n"),
});

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
    reading: {},
    classification: { title: title.join(" "), description: "", tags: [] },
  });
  return itemId;
}

describe("searching saves", () => {
  it("finds every one of your saves with the word, and never anyone else's", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(savedTitle, { minLength: 1, maxLength: 4 }),
        spelling,
        async (titles, { upper, padding }) => {
          const base = newConvexTest();
          const { as, ids } = await signedIn(base, { pro: true });

          await saveFinished(
            base,
            as["user-b"],
            "https://example.com/b",
            WORDS,
          );
          const mine = new Map<Id<"items">, string[]>();
          for (const [index, title] of titles.entries()) {
            const url = `https://example.com/${index}`;
            mine.set(await saveFinished(base, as["user-a"], url, title), title);
          }

          for (const word of WORDS) {
            const found = await as["user-a"].query(api.items.searchItems, {
              query: `${padding}${upper ? word.toUpperCase() : word}${padding}`,
            });
            expect(found.map((item) => item._id).sort()).toEqual(
              [...mine]
                .filter(([, title]) => title.includes(word))
                .map(([itemId]) => itemId)
                .sort(),
            );
            expect(found.every((item) => item.userId === ids["user-a"])).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: SLOW_PROPERTY_RUNS },
    );
  });

  it("returns nothing for a blank search", async () => {
    const base = newConvexTest();
    const t = (await signedIn(base, { pro: true })).as["user-a"];
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
