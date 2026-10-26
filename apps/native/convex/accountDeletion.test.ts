// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import {
  newConvexTest,
  seedNotes,
  signedInUser,
  type TestBackend,
} from "./test.setup";
import { DELETE_BATCH } from "./users";

// Skill: .agents/skills/account-deletion/SKILL.md says how to read a failure.

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DRAIN_PASSES = 30;

const UNOWNED_TABLES: Record<string, string> = {
  detachedAppleTokens:
    "a web sign-in's Apple token that landed on an account already deleting; no owner key by design, removed by revokeDetachedToken or forgetDetachedAppleToken",
  paymentAnalyticsReceipts: "event ids only, no reference to an account",
  waitlistSignups:
    "the marketing waitlist, keyed by email and consented to apart from any account",
  authVerifiers:
    "Convex Auth's sign-in verifier; its session is optional, so it cannot be attributed to an account. Library table, not audited here",
  authRateLimits:
    "Convex Auth's sign-in throttle, keyed by an identifier rather than an account. Library table, not audited here",
};

const RETAINED_ROWS: Record<string, { jobs: string[]; reason: string }> = {
  appleTokens: {
    jobs: ["appleRevoke:revoke", "users:forgetAppleToken"],
    reason:
      "the revoke job needs the token; it removes the row once Apple has answered, and the forget job does within the hour",
  },
  legalConsents: {
    jobs: ["legalConsentSync:send"],
    reason:
      "the withdrawal of refund-data sharing must reach RevenueCat first (docs/architecture/refund-consent.md)",
  },
};

const ONE_ROW_PER_ACCOUNT = new Set([
  "subscriptions",
  "aiConsents",
  "cancelSurveys",
]);

type Validator = {
  kind: string;
  isOptional: "required" | "optional";
  tableName?: string;
  fields?: Record<string, Validator>;
  members?: Validator[];
  value?: unknown;
};

const TABLES = schema.tables as unknown as Record<
  string,
  { validator: Validator }
>;

function fieldsOf(table: string): Record<string, Validator> {
  const { validator } = TABLES[table];
  if (validator.kind !== "object" || validator.fields === undefined) {
    throw new Error(`${table}: only object tables are understood`);
  }
  return validator.fields;
}

function isOwnerField(name: string, field: Validator): boolean {
  return (
    name === "userId" || (field.kind === "id" && field.tableName === "users")
  );
}

function requiredRefs(table: string): string[] {
  return Object.values(fieldsOf(table))
    .filter((field) => field.kind === "id" && field.isOptional === "required")
    .map((field) => field.tableName ?? "")
    .filter((ref) => ref !== "users" && ref !== "_storage");
}

function classifyTables() {
  const names = Object.keys(TABLES).filter((name) => name !== "users");
  const owned = names.filter((table) =>
    Object.entries(fieldsOf(table)).some(([name, field]) =>
      isOwnerField(name, field),
    ),
  );
  const children: string[] = [];
  for (let grew = true; grew; ) {
    grew = false;
    for (const table of names) {
      const reachable = [...owned, ...children];
      if (reachable.includes(table)) continue;
      if (requiredRefs(table).some((ref) => reachable.includes(ref))) {
        children.push(table);
        grew = true;
      }
    }
  }
  const unowned = names.filter(
    (name) => !owned.includes(name) && !children.includes(name),
  );
  return { owned, children, unowned };
}

const { owned: OWNED, children: CHILDREN, unowned: UNOWNED } = classifyTables();
const ACCOUNT_TABLES = [...OWNED, ...CHILDREN];
const MULTI_ROW_TABLES = OWNED.filter(
  (table) => !(table in RETAINED_ROWS) && !ONE_ROW_PER_ACCOUNT.has(table),
);

type RunCtx = Parameters<Parameters<TestBackend["run"]>[0]>[0];
type Owner = { userId: Id<"users">; key: string };
type Refs = Map<string, string>;
type Copies = Record<string, number>;
type Seeded = {
  userId: Id<"users">;
  rows: { table: string; id: string }[];
  blobs: Id<"_storage">[];
};

function missingRef(table: string | undefined): never {
  throw new Error(`no row of ${table} to point at; the fixture order is wrong`);
}

function sample(
  field: Validator,
  name: string,
  owner: Owner,
  refs: Refs,
): unknown {
  switch (field.kind) {
    case "string":
      return name === "userId" ? owner.key : `${name}.${owner.key}`;
    case "float64":
      return 1;
    case "int64":
      return BigInt(1);
    case "boolean":
      return false;
    case "null":
    case "any":
      return null;
    case "bytes":
      return new ArrayBuffer(0);
    case "literal":
      return field.value;
    case "array":
      return [];
    case "record":
      return {};
    case "id":
      return refs.get(field.tableName ?? "") ?? missingRef(field.tableName);
    case "union":
      return sample(field.members![0], name, owner, refs);
    case "object":
      return requiredFields(field.fields!, owner, refs);
    default:
      throw new Error(`no sample for validator kind ${field.kind}`);
  }
}

function requiredFields(
  fields: Record<string, Validator>,
  owner: Owner,
  refs: Refs,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, field]) => field.isOptional === "required")
      .map(([name, field]) => [name, sample(field, name, owner, refs)]),
  );
}

async function insertRow(
  ctx: RunCtx,
  table: string,
  owner: Owner,
  refs: Refs,
  seeded: Seeded,
): Promise<string> {
  const doc: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fieldsOf(table))) {
    if (field.kind === "id" && field.tableName === "_storage") {
      const blob = await ctx.storage.store(new Blob([`${table}.${name}`]));
      seeded.blobs.push(blob);
      doc[name] = blob;
    } else if (field.isOptional === "required") {
      doc[name] = sample(field, name, owner, refs);
    }
  }
  const id = await ctx.db.insert(table as TableNames, doc as never);
  seeded.rows.push({ table, id });
  return id;
}

async function seedAccount(
  backend: TestBackend,
  userId: Id<"users">,
  copies: Copies = {},
): Promise<Seeded> {
  return await backend.run(async (ctx) => {
    const owner: Owner = { userId, key: String(userId) };
    const seeded: Seeded = { userId, rows: [], blobs: [] };
    const refs: Refs = new Map([["users", userId]]);
    const pending = new Set(ACCOUNT_TABLES);
    while (pending.size > 0) {
      const next = [...pending].find((table) =>
        requiredRefs(table).every((ref) => !pending.has(ref)),
      );
      if (next === undefined) {
        throw new Error(`tables reference each other: ${[...pending]}`);
      }
      pending.delete(next);
      for (let copy = 0; copy < (copies[next] ?? 1); copy++) {
        refs.set(next, await insertRow(ctx, next, owner, refs, seeded));
      }
    }
    return seeded;
  });
}

async function fillRows(
  ctx: RunCtx,
  userId: Id<"users">,
  fillers: Copies,
): Promise<void> {
  const owner: Owner = { userId, key: String(userId) };
  const seeded: Seeded = { userId, rows: [], blobs: [] };
  for (const [table, count] of Object.entries(fillers)) {
    const refs: Refs = new Map([["users", userId]]);
    for (const ref of requiredRefs(table)) {
      const row = await ctx.db.query(ref as TableNames).first();
      if (row !== null) refs.set(ref, row._id);
    }
    for (let copy = 0; copy < count; copy++) {
      await insertRow(ctx, table, owner, refs, seeded);
    }
  }
}

async function userExists(
  backend: TestBackend,
  userId: Id<"users">,
): Promise<boolean> {
  return (await backend.run((ctx) => ctx.db.get(userId))) !== null;
}

async function countRows(backend: TestBackend, table: string): Promise<number> {
  return await backend.run(
    async (ctx) => (await ctx.db.query(table as TableNames).collect()).length,
  );
}

async function drainPasses(
  backend: TestBackend,
  userId: Id<"users">,
  limit: number,
): Promise<number> {
  let passes = 0;
  while (passes < limit && (await userExists(backend, userId))) {
    await backend.mutation(internal.users.processAccountDeletion, { userId });
    passes++;
  }
  return passes;
}

async function finishDrain(
  backend: TestBackend,
  userId: Id<"users">,
): Promise<void> {
  await drainPasses(backend, userId, MAX_DRAIN_PASSES);
  expect(
    await userExists(backend, userId),
    `the drain was still running after ${MAX_DRAIN_PASSES} passes`,
  ).toBe(false);
}

async function survivors(
  backend: TestBackend,
  seeded: Seeded,
): Promise<string[]> {
  return await backend.run(async (ctx) => {
    const found: string[] = [];
    for (const { table, id } of seeded.rows) {
      if (table in RETAINED_ROWS) continue;
      if ((await ctx.db.get(id as Id<TableNames>)) !== null) {
        found.push(
          `${table}: a row survived. Add a drain step to deleteUserOwnedDataBatch in users.ts, or list the table in RETAINED_ROWS with the job that removes it`,
        );
      }
    }
    for (const blob of seeded.blobs) {
      if ((await ctx.db.system.get(blob)) !== null) {
        found.push(
          "_storage: a blob the account owned survived (a drain step must call safeDeleteStorage)",
        );
      }
    }
    if ((await ctx.db.get(seeded.userId)) !== null) {
      found.push("users: the account row survived the drain");
    }
    return found;
  });
}

function ownsBlobs(table: string): boolean {
  return Object.values(fieldsOf(table)).some(
    (field) => field.kind === "id" && field.tableName === "_storage",
  );
}

async function readRows(backend: TestBackend, seeded: Seeded) {
  return await backend.run((ctx) =>
    Promise.all(seeded.rows.map(({ id }) => ctx.db.get(id as Id<TableNames>))),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the tables", () => {
  it("accounts for every table in schema.ts", () => {
    const unexplained = UNOWNED.filter((table) => !(table in UNOWNED_TABLES));
    expect(
      unexplained,
      "a table with no user key and no entry in UNOWNED_TABLES; if it can hold anything of a person, give it a userId and a drain step in users.ts",
    ).toEqual([]);
    const stale = Object.keys(UNOWNED_TABLES).filter(
      (table) => !UNOWNED.includes(table),
    );
    expect(
      stale,
      "UNOWNED_TABLES names a table that is gone or now owned",
    ).toEqual([]);
    const notOwned = Object.keys(RETAINED_ROWS).filter(
      (table) => !ACCOUNT_TABLES.includes(table),
    );
    expect(notOwned, "RETAINED_ROWS names a table that is not owned").toEqual(
      [],
    );
    const notSingle = [...ONE_ROW_PER_ACCOUNT].filter(
      (table) => !OWNED.includes(table),
    );
    expect(
      notSingle,
      "ONE_ROW_PER_ACCOUNT names a table that is not owned",
    ).toEqual([]);
  });
});

describe("deleting an account", () => {
  async function deleteBesideBystander() {
    const backend = newConvexTest();
    const doomedUser = await signedInUser(backend, { aiConsent: "unset" });
    const bystanderUser = await signedInUser(backend, { aiConsent: "unset" });
    const doomed = await seedAccount(backend, doomedUser.userId);
    const bystander = await seedAccount(backend, bystanderUser.userId);
    const bystanderBefore = await readRows(backend, bystander);
    await doomedUser.t.mutation(api.users.deleteCurrentUserAccount, {});
    return { backend, doomed, bystander, bystanderBefore };
  }

  it("seeds a row in every table the account owns", async () => {
    const backend = newConvexTest();
    const { userId } = await signedInUser(backend, { aiConsent: "unset" });
    const seeded = await seedAccount(backend, userId);
    expect(seeded.rows.map((row) => row.table).sort()).toEqual(
      [...ACCOUNT_TABLES].sort(),
    );
    expect(seeded.blobs.length).toBeGreaterThan(0);
  });

  it("leaves nothing of the account except the retained rows", async () => {
    const { backend, doomed } = await deleteBesideBystander();
    expect(await survivors(backend, doomed)).toEqual([]);
  });

  it("adds no row the fixture did not put there", async () => {
    const { backend, doomed, bystander } = await deleteBesideBystander();
    const known = new Set([...doomed.rows, ...bystander.rows].map((r) => r.id));
    known.add(doomed.userId);
    known.add(bystander.userId);
    const strays = await backend.run(async (ctx) => {
      const found: string[] = [];
      for (const table of Object.keys(TABLES)) {
        const rows = await ctx.db.query(table as TableNames).collect();
        const extra = rows.filter((row) => !known.has(row._id));
        if (extra.length > 0) {
          found.push(`${table}: ${extra.length} extra row(s)`);
        }
      }
      return found;
    });
    expect(strays).toEqual([]);
  });

  it("leaves another account exactly as it was", async () => {
    const { backend, bystander, bystanderBefore } =
      await deleteBesideBystander();
    const after = await readRows(backend, bystander);
    const changed = bystander.rows
      .filter(
        (_, i) =>
          JSON.stringify(after[i]) !== JSON.stringify(bystanderBefore[i]),
      )
      .map((row) => row.table);
    expect(changed).toEqual([]);
  });

  it("schedules the job that removes each retained row", async () => {
    const { backend, doomed } = await deleteBesideBystander();
    const jobs = await backend.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const problems: string[] = [];
    for (const [table, retained] of Object.entries(RETAINED_ROWS)) {
      const row = doomed.rows.find((r) => r.table === table)!;
      const alive = await backend.run((ctx) =>
        ctx.db.get(row.id as Id<TableNames>),
      );
      if (alive === null) {
        problems.push(
          `${table}: listed as retained but deleted; drop the entry`,
        );
      }
      for (const name of retained.jobs) {
        const scheduled = jobs.some(
          (job) =>
            job.name === name && JSON.stringify(job.args).includes(row.id),
        );
        if (!scheduled) {
          problems.push(
            `${table}: no ${name} job for the row (${retained.reason})`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it.each(MULTI_ROW_TABLES)("drains %s across batches", async (table) => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend, { aiConsent: "unset" });
    const seeded = await seedAccount(backend, userId, {
      [table]: DELETE_BATCH + 1,
    });
    try {
      await t.mutation(api.users.deleteCurrentUserAccount, {});
      await finishDrain(backend, userId);
    } catch (error) {
      throw new Error(
        `draining ${DELETE_BATCH + 1} rows of ${table} failed: ${String(error)}. If the table holds one row per account by design, add it to ONE_ROW_PER_ACCOUNT`,
        { cause: error },
      );
    }
    const own = (await survivors(backend, seeded)).filter(
      (message) =>
        message.startsWith(`${table}:`) ||
        message.startsWith("users:") ||
        (message.startsWith("_storage:") && ownsBlobs(table)),
    );
    expect(own).toEqual([]);
  });
});

const CONVEX_DIR = fileURLToPath(new URL(".", import.meta.url));

type Fn = {
  key: string;
  name: string;
  registered: boolean;
  calls: Set<string>;
  inserts: Set<string>;
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "_generated" ? [] : sourceFiles(path);
    }
    const keep =
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.includes(".test.") &&
      entry.name !== "test.setup.ts";
    return keep ? [path] : [];
  });
}

function summarize(
  file: string,
  name: string,
  node: ts.Node,
  registered: boolean,
): Fn {
  const calls = new Set<string>();
  const inserts = new Set<string>();
  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child)) {
      const callee = child.expression;
      if (ts.isIdentifier(callee)) {
        calls.add(callee.text);
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "insert" &&
        /\bdb$/.test(callee.expression.getText())
      ) {
        const [table] = child.arguments;
        inserts.add(
          table !== undefined && ts.isStringLiteralLike(table)
            ? table.text
            : "<dynamic>",
        );
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return { key: `${file}#${name}`, name, registered, calls, inserts };
}

function topLevelFunctions(path: string): Fn[] {
  const file = relative(CONVEX_DIR, path);
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: Fn[] = [];
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      found.push(summarize(file, statement.name.text, statement, false));
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const { name, initializer } of statement.declarationList
      .declarations) {
      if (ts.isIdentifier(name) && initializer !== undefined) {
        const registered = ts.isCallExpression(initializer);
        found.push(summarize(file, name.text, initializer, registered));
      }
    }
  }
  return found;
}

function fencingNames(fns: Fn[]): Set<string> {
  const fencing = new Set(["liveOwner"]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const fn of fns) {
      if (fn.registered || fencing.has(fn.name)) continue;
      if ([...fn.calls].some((call) => fencing.has(call))) {
        fencing.add(fn.name);
        grew = true;
      }
    }
  }
  return fencing;
}

function callersByName(fns: Fn[]): Map<string, Fn[]> {
  const callers = new Map<string, Fn[]>();
  for (const fn of fns) {
    for (const call of fn.calls) {
      callers.set(call, [...(callers.get(call) ?? []), fn]);
    }
  }
  return callers;
}

type Graph = { fencing: Set<string>; callers: Map<string, Fn[]> };

function isFenced(fn: Fn, graph: Graph, seen: Set<string>): boolean {
  if ([...fn.calls].some((call) => graph.fencing.has(call))) return true;
  if (fn.registered) return false;
  if (seen.has(fn.key)) return true;
  seen.add(fn.key);
  const callers = graph.callers.get(fn.name) ?? [];
  return (
    callers.length > 0 &&
    callers.every((caller) => isFenced(caller, graph, seen))
  );
}

function scanWriters() {
  const fns = sourceFiles(CONVEX_DIR).flatMap(topLevelFunctions);
  const graph = { fencing: fencingNames(fns), callers: callersByName(fns) };
  const writers = fns.filter((fn) =>
    [...fn.inserts].some(
      (t) => ACCOUNT_TABLES.includes(t) || t === "<dynamic>",
    ),
  );
  const unfenced = writers
    .filter((fn) => !isFenced(fn, graph, new Set()))
    .map((fn) => fn.key)
    .sort();
  const helperNames = fns.filter((fn) => !fn.registered).map((fn) => fn.name);
  const ambiguous = [
    ...new Set(helperNames.filter((n, i) => helperNames.indexOf(n) !== i)),
  ].filter((name) => graph.fencing.has(name));
  return { writers, unfenced, ambiguous };
}

describe("the writers", () => {
  const scan = scanWriters();

  it("finds the writers (the scan is not empty)", () => {
    expect(scan.writers.length).toBeGreaterThan(15);
  });

  it("names no owner check twice (the call graph resolves names)", () => {
    expect(scan.ambiguous).toEqual([]);
  });

  it("checks the owner before every insert into an owned table", () => {
    expect(
      scan.unfenced,
      "inserts into an owned table with no liveOwner/requireUserId/aiAllowed in it or in all its callers. Add the check; a function a cron or scheduled job reaches also gets a recipe below",
    ).toEqual([]);
  });

  it("keeps a recipe only for a writer that still checks the owner", () => {
    const keys = Object.keys(RECIPES);
    const writers = scan.writers.map((fn) => fn.key);
    expect(
      keys.filter((key) => !writers.includes(key)),
      "RECIPES names a function that is gone or no longer inserts into an owned table",
    ).toEqual([]);
    expect(
      keys.filter((key) => scan.unfenced.includes(key)),
      "a RECIPES writer lost its owner check",
    ).toEqual([]);
  });
});

type Recipe = {
  fence: string;
  table: string;
  padding: number;
  fillers: Copies;
  env?: Record<string, string>;
  advanceMs?: number;
  seed(backend: TestBackend, userId: Id<"users">, now: number): Promise<void>;
  call(
    backend: TestBackend,
    userId: Id<"users">,
    now: number,
  ): Promise<unknown>;
  claim?(backend: TestBackend): Promise<unknown>;
};

const RECIPES: Record<string, Recipe> = {
  "notifications.ts#prepareWeeklyDigest": {
    fence:
      "liveOwner at the top of the handler, so a draining account gets no digest",
    table: "weeklyDigests",
    padding: 3 * DELETE_BATCH + 1,
    fillers: {},
    seed: async (backend, userId, now) => {
      await backend.run(async (ctx) => {
        await ctx.db.insert("notificationPreferences", {
          userId,
          weeklyShelfEnabled: true,
          nextDigestAt: 0,
          timezone: "UTC",
          updatedAt: now,
        });
        await ctx.db.insert("notificationDevices", {
          userId,
          token: `ExponentPushToken[${userId}]`,
          platform: "ios",
          enabled: true,
          lastSeenAt: now,
        });
      });
      await seedNotes(backend, userId, 3);
    },
    call: (backend, userId, now) =>
      backend.mutation(internal.notifications.prepareWeeklyDigest, {
        userId,
        now,
      }),
    claim: async (backend) => {
      const digest = await backend.run((ctx) =>
        ctx.db.query("weeklyDigests").order("desc").first(),
      );
      return await backend.mutation(internal.notificationDelivery.claim, {
        digestId: digest!._id,
      });
    },
  },
  "notifications.ts#prepareSaveReminder": {
    fence:
      "liveOwner at the top of the handler, so a draining account gets no reminder",
    table: "saveReminders",
    padding: 3 * DELETE_BATCH + 1,
    fillers: {},
    env: { SAVE_REMINDERS_ENABLED: "true" },
    advanceMs: 2 * DAY_MS,
    seed: async (backend, userId, now) => {
      await backend.run(async (ctx) => {
        await ctx.db.insert("notificationPreferences", {
          userId,
          weeklyShelfEnabled: false,
          nextDigestAt: now + 7 * DAY_MS,
          nextReminderAt: now - 60_000,
          timezone: "UTC",
          updatedAt: now,
        });
        await ctx.db.insert("notificationDevices", {
          userId,
          token: `ExponentPushToken[${userId}]`,
          platform: "ios",
          enabled: true,
          lastSeenAt: now,
        });
        await ctx.db.insert("items", {
          userId,
          type: "link",
          status: "ready",
          tags: [],
          searchText: "an article",
          title: "An article",
          url: "https://example.com/article",
          content: "Something worth reading later.",
        });
      });
    },
    call: (backend, userId, now) =>
      backend.mutation(internal.notifications.prepareSaveReminder, {
        userId,
        now,
      }),
    claim: async (backend) => {
      const reminder = await backend.run((ctx) =>
        ctx.db.query("saveReminders").order("desc").first(),
      );
      return await backend.mutation(
        internal.notificationDelivery.claimReminder,
        {
          reminderId: reminder!._id,
        },
      );
    },
  },
  "planShares.ts#recordPlanVote": {
    fence:
      "liveShare calls liveOwner, so a vote on a draining owner's link is refused",
    table: "planVotes",
    padding: DELETE_BATCH + 1,
    fillers: { spaceItems: DELETE_BATCH + 1 },
    seed: async (backend, userId, now) => {
      await backend.run(async (ctx) => {
        const spaceId = await ctx.db.insert("spaces", { userId, name: "Trip" });
        const itemId = await ctx.db.insert("items", {
          userId,
          type: "note",
          status: "ready",
          tags: [],
          searchText: "a place",
          note: "a place",
        });
        await ctx.db.insert("planShares", {
          token: "vote-token",
          userId,
          spaceId,
          places: [{ key: "a", name: "A", why: "worth it", itemId }],
          expiresAt: now + 7 * DAY_MS,
        });
      });
    },
    call: (backend) =>
      backend.mutation(internal.planShares.recordPlanVote, {
        token: "vote-token",
        voterId: "visitor",
        picks: ["a"],
        passes: [],
      }),
  },
};

type Outcome = {
  boundary: number;
  gone: boolean;
  wrote: boolean;
  error: string | null;
  leftover: number;
};

async function newUniverse(recipe: Recipe) {
  for (const [name, value] of Object.entries(recipe.env ?? {})) {
    vi.stubEnv(name, value);
  }
  const backend = newConvexTest();
  const { userId, t } = await signedInUser(backend, { aiConsent: "unset" });
  const now = Date.now() + (recipe.advanceMs ?? 0);
  await seedNotes(backend, userId, recipe.padding);
  await recipe.seed(backend, userId, now);
  vi.setSystemTime(now);
  return { backend, userId, t, now };
}

async function newDrainingUniverse(recipe: Recipe) {
  const universe = await newUniverse(recipe);
  await universe.backend.run((ctx) =>
    fillRows(ctx, universe.userId, recipe.fillers),
  );
  return universe;
}

async function callWriter(
  recipe: Recipe,
  backend: TestBackend,
  userId: Id<"users">,
  now: number,
) {
  const before = await countRows(backend, recipe.table);
  let error: string | null = null;
  try {
    await recipe.call(backend, userId, now);
  } catch (thrown) {
    error = String(thrown).split("\n")[0];
  }
  const wrote = (await countRows(backend, recipe.table)) > before;
  return { wrote, error };
}

async function runWriterAtBoundary(
  recipe: Recipe,
  boundary: number,
): Promise<Outcome> {
  const { backend, userId, t, now } = await newDrainingUniverse(recipe);
  await t.mutation(api.users.deleteCurrentUserAccount, {});
  await drainPasses(backend, userId, boundary);
  const gone = !(await userExists(backend, userId));
  const { wrote, error } = await callWriter(recipe, backend, userId, now);
  await finishDrain(backend, userId);
  const leftover = await countRows(backend, recipe.table);
  return { boundary, gone, wrote, error, leftover };
}

async function runWriterAtEveryBoundary(recipe: Recipe): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (let boundary = 0; boundary <= MAX_DRAIN_PASSES; boundary++) {
    const outcome = await runWriterAtBoundary(recipe, boundary);
    outcomes.push(outcome);
    if (outcome.gone) return outcomes;
  }
  throw new Error("the drain never finished while sweeping the boundaries");
}

function story(outcomes: Outcome[]): string {
  return outcomes
    .map((o) => {
      const state = o.gone
        ? "account gone"
        : `after ${o.boundary} more pass(es)`;
      const result = o.wrote ? "wrote a row" : (o.error ?? "wrote nothing");
      return `${state}: ${result}; ${o.leftover} row(s) left after the drain`;
    })
    .join("\n");
}

describe.each(Object.keys(RECIPES))("%s, with an owner check", (key) => {
  const recipe = RECIPES[key];

  it("writes for a live account in the sweep's setup (the recipe reaches the insert)", async () => {
    const { backend, userId, now } = await newDrainingUniverse(recipe);
    const { wrote, error } = await callWriter(recipe, backend, userId, now);
    expect(wrote, error ?? "the writer inserted nothing").toBe(true);
  });

  it("refuses a draining account at every drain pass", async () => {
    const outcomes = await runWriterAtEveryBoundary(recipe);
    expect(
      outcomes.filter((o) => !o.gone).length,
      `the account finished deleting before there were two gaps to test\n${story(outcomes)}`,
    ).toBeGreaterThan(1);
    expect(
      outcomes.filter((o) => o.wrote || o.error !== null || o.leftover > 0),
      `${recipe.fence}\n${story(outcomes)}`,
    ).toEqual([]);
  });
});

describe.each(Object.keys(RECIPES).filter((key) => RECIPES[key].claim))(
  "%s, then its delivery claim",
  (key) => {
    const recipe = RECIPES[key];

    async function prepared() {
      const universe = await newUniverse(recipe);
      const { wrote, error } = await callWriter(
        recipe,
        universe.backend,
        universe.userId,
        universe.now,
      );
      expect(wrote, error ?? "the writer prepared nothing").toBe(true);
      return universe;
    }

    it("hands out what it prepared for a live account (the recipe reaches the claim)", async () => {
      const { backend } = await prepared();
      expect(await recipe.claim!(backend)).not.toBeNull();
    });

    it("hands out nothing once the account began deleting", async () => {
      const { backend, userId, t } = await prepared();
      await t.mutation(api.users.deleteCurrentUserAccount, {});
      expect(
        await userExists(backend, userId),
        "the account finished deleting in one pass, so there is no window to test",
      ).toBe(true);
      expect(
        await recipe.claim!(backend),
        "the claim accepted a notification for an account that began deleting; give it a liveOwner check",
      ).toBeNull();
    });

    it("closes what it refuses, so recovery does not queue it again", async () => {
      const { backend, t } = await prepared();
      await t.mutation(api.users.deleteCurrentUserAccount, {});
      const jobs = () =>
        backend.run(
          async (ctx) =>
            (
              await ctx.db.system.query("_scheduled_functions").collect()
            ).filter((job) =>
              /notificationDelivery:send|captureNotification/.test(job.name),
            ).length,
        );
      const before = await jobs();
      await recipe.claim!(backend);
      await backend.mutation(internal.notificationDelivery.recover, {});
      expect(
        await jobs(),
        "a refused claim scheduled a send or an analytics event, or recover queued the row again",
      ).toBe(before);
      const row = await backend.run((ctx) =>
        ctx.db
          .query(recipe.table as TableNames)
          .order("desc")
          .first(),
      );
      expect(
        row,
        "the claim refused the notification but left the row open; close it with OWNER_UNAVAILABLE",
      ).toMatchObject({
        deliveryStatus: "failed",
        deliveryError: "owner_unavailable",
      });
    });
  },
);
