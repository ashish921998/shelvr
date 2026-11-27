import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearHandoff,
  dropFirstSaveNotFor,
  finishHandoff,
  firstSaveDone,
  dropLegacyProgress,
  forgetPaywallAnswer,
  handOverFirstSave,
  noteReplayDeclined,
  notePaywallAnswer,
  paywallBlocked,
  readHandoffWork,
  settleHandoff,
  subscribeHandoff,
  type OnboardingAnswers,
} from "./onboarding-handoff";
import type { Goal } from "./onboarding-goals";

const KEY = "shelvr.pending.onboarding";
const REEL = "https://example.com/reel";

const device = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  failing: false,
  unreadable: false,
  minted: 0,
}));
const captureError = vi.hoisted(() => vi.fn());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => {
    if (device.unreadable) throw new Error("keychain locked");
    return device.storage.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (device.failing) throw new Error("keychain locked");
    device.storage.set(key, value);
  },
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => `id-${++device.minted}`,
}));
vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "en-US" }],
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError } }));

function answers(goals: Goal[] = [], skippedShare = true): OnboardingAnswers {
  return {
    goals,
    travelCity: null,
    beenCities: [],
    savedCount: null,
    skippedShare,
  };
}

function stored(): Record<string, unknown> {
  return JSON.parse(device.storage.get(KEY) ?? "{}") as Record<string, unknown>;
}

function store(record: Record<string, unknown>) {
  device.storage.set(KEY, JSON.stringify(record));
}

const operation = () => readHandoffWork().operationId;

beforeEach(() => {
  device.storage.clear();
  device.failing = false;
  device.unreadable = false;
  device.minted = 0;
  captureError.mockReset();
  forgetPaywallAnswer();
});

describe("a no to the replay's paywall", () => {
  it("is kept for the work it was asked about, through the record's rewrites", () => {
    handOverFirstSave(REEL);
    noteReplayDeclined(operation());
    expect(paywallBlocked()).toBe(true);
    finishHandoff(answers(["food"]), null);
    firstSaveDone(operation()!);
    expect(paywallBlocked()).toBe(true);
    clearHandoff();
    expect(paywallBlocked()).toBe(false);
  });

  it("is ignored for other work, or when nothing is queued", () => {
    noteReplayDeclined("onboarding:gone");
    expect(paywallBlocked()).toBe(false);
    handOverFirstSave(REEL);
    noteReplayDeclined("onboarding:gone");
    noteReplayDeclined(null);
    expect(paywallBlocked()).toBe(false);
  });

  it("stops holding the paywall once new work gets a new operation", () => {
    handOverFirstSave(REEL);
    noteReplayDeclined(operation());
    handOverFirstSave("https://example.com/other");
    expect(paywallBlocked()).toBe(false);
  });
});

describe("the answer to the onboarding paywall", () => {
  it("holds the replay's paywall until it is forgotten", () => {
    notePaywallAnswer("declined");
    expect(paywallBlocked()).toBe(true);
    forgetPaywallAnswer();
    notePaywallAnswer("purchased");
    expect(paywallBlocked()).toBe(true);
    forgetPaywallAnswer();
    expect(paywallBlocked()).toBe(false);
  });
});

describe("onboarding recovery", () => {
  it("does not request a replay or paywall when storage is absent, cleared, or corrupt", () => {
    expect(readHandoffWork().has).toBe(false);
    finishHandoff(answers(["travel"]), null);
    expect(readHandoffWork().has).toBe(true);
    clearHandoff();
    expect(readHandoffWork().has).toBe(false);
    device.storage.set(KEY, "{broken");
    expect(readHandoffWork().has).toBe(false);
  });

  it("retains an older queued link and its operation id when onboarding finishes again", () => {
    store({
      operationId: "legacy-operation",
      spaces: ["Recipes"],
      demoUrl: "https://example.com",
    });
    finishHandoff(answers(["food", "date"]), null);
    expect(readHandoffWork()).toMatchObject({
      has: true,
      operationId: "legacy-operation",
      firstSave: { url: "https://example.com" },
    });
  });
});

describe("the operation id", () => {
  it("is minted once when onboarding finishes with a reel", () => {
    finishHandoff(answers(["date"], false), REEL);
    expect(device.minted).toBe(1);
    expect(operation()).toBe("onboarding:id-1");
  });

  it("is kept when onboarding finishes again with the reel already queued", () => {
    finishHandoff(answers(["date"], false), REEL);
    finishHandoff(answers(["food"], false), REEL);
    expect(operation()).toBe("onboarding:id-1");
  });

  it.each([
    ["a space", { demoSpace: "Recipes" }],
    ["another account", { demoOwner: "user_1" }],
  ])(
    "is new when the queued reel was picked for %s",
    (_why, queued: Record<string, string>) => {
      store({
        operationId: "legacy-operation",
        spaces: [],
        demoUrl: REEL,
        ...queued,
      });
      finishHandoff(answers(["date"], false), REEL);
      expect(operation()).not.toBe("legacy-operation");
      expect(readHandoffWork().firstSave).toEqual({ url: REEL, space: null });
    },
  );

  it("keeps a queued link's space, account and operation when the share was skipped", () => {
    handOverFirstSave(REEL, "Recipes", "user_1");
    const queued = operation();
    finishHandoff(answers(["date"]), null);
    expect(operation()).toBe(queued);
    expect(stored()).toMatchObject({
      demoUrl: REEL,
      demoSpace: "Recipes",
      demoOwner: "user_1",
    });
  });

  it("is new for each finish that hands over spaces and no reel", () => {
    finishHandoff(answers(["date"]), null);
    const first = operation();
    finishHandoff(answers(["date"]), null);
    expect(operation()).not.toBe(first);
  });

  it("is kept by a finish that hands over nothing", () => {
    finishHandoff(answers(["date"]), null);
    const first = operation();
    finishHandoff(answers(), null);
    expect(operation()).toBe(first);
    expect(readHandoffWork().has).toBe(false);
  });

  it("is kept for the same handed-over link and new for a different one", () => {
    handOverFirstSave(REEL, "Recipes", "user_1");
    const first = operation();
    handOverFirstSave(REEL, "Recipes", "user_1");
    expect(operation()).toBe(first);
    handOverFirstSave(REEL, null, "user_1");
    expect(operation()).not.toBe(first);
  });
});

describe("a first save queued before sign-in", () => {
  it("waits for the replay and survives finishing onboarding", () => {
    handOverFirstSave("https://example.com/recipe");
    expect(readHandoffWork().has).toBe(true);
    finishHandoff(answers(), null);
    expect(readHandoffWork()).toMatchObject({
      has: true,
      firstSave: { url: "https://example.com/recipe" },
    });
  });

  it("keeps the space it was picked for until the link is saved", () => {
    handOverFirstSave("https://example.com/recipe", "Recipes");
    finishHandoff(answers(["food"]), null);
    expect(readHandoffWork().firstSave?.space).toBe("Recipes");
    firstSaveDone(operation()!);
    expect(readHandoffWork().firstSave).toBeNull();
    expect(stored()).toMatchObject({ demoSpace: null, demoOwner: null });
  });

  it("is dropped for any account but the one it was handed over for", () => {
    handOverFirstSave("https://example.com/recipe", "Recipes", "user_1");
    expect(dropFirstSaveNotFor("user_1")).toBe(true);
    expect(readHandoffWork().firstSave).not.toBeNull();
    expect(dropFirstSaveNotFor("user_2")).toBe(true);
    expect(readHandoffWork().firstSave).toBeNull();
  });

  it("stays queued when another operation took its place before it saved", () => {
    handOverFirstSave("https://example.com/first");
    const first = operation()!;
    handOverFirstSave("https://example.com/late");
    firstSaveDone(first);
    expect(readHandoffWork().firstSave?.url).toBe("https://example.com/late");
  });
});

describe("settling the replay's work", () => {
  it("clears the work it attempted once its link is saved", () => {
    finishHandoff(answers(["date"], false), REEL);
    const attempted = readHandoffWork();
    expect(settleHandoff(attempted)).toBe("changed");
    firstSaveDone(attempted.operationId!);
    expect(settleHandoff(attempted)).toBe("cleared");
    expect(readHandoffWork().has).toBe(false);
  });

  it("clears the work it attempted", () => {
    finishHandoff(answers(["date"]), null);
    expect(settleHandoff(readHandoffWork())).toBe("cleared");
    expect(readHandoffWork().has).toBe(false);
  });

  it("keeps work that changed or arrived while it ran", () => {
    finishHandoff(answers(["date"]), null);
    const attempted = readHandoffWork();
    finishHandoff(answers(["travel"]), null);
    expect(settleHandoff(attempted)).toBe("changed");
    expect(readHandoffWork().has).toBe(true);

    const now = readHandoffWork();
    handOverFirstSave(REEL);
    expect(settleHandoff(now)).toBe("changed");
    expect(readHandoffWork().firstSave?.url).toBe(REEL);
  });
});

describe("a store that cannot be written", () => {
  it("never strands onboarding: finishing and clearing report the failure instead of throwing", () => {
    device.failing = true;
    expect(() => finishHandoff(answers(["date"], false), REEL)).not.toThrow();
    expect(() => clearHandoff()).not.toThrow();
    expect(captureError).toHaveBeenCalledWith(
      "onboarding_handoff_finish_failed",
      expect.any(Error),
    );
    expect(captureError).toHaveBeenCalledWith(
      "onboarding_handoff_clear_failed",
      expect.any(Error),
    );
  });

  it("throws on a handover, so the caller keeps its copy of the link", () => {
    device.failing = true;
    expect(() => handOverFirstSave(REEL)).toThrow("keychain locked");
  });

  it("reports a saved link it could not mark done, so the replay stops there", () => {
    handOverFirstSave(REEL);
    device.failing = true;
    expect(firstSaveDone(operation()!)).toBe(false);
    expect(captureError).toHaveBeenCalledWith(
      "onboarding_first_save_clear_failed",
      expect.any(Error),
    );
  });

  it("keeps the replay off a link for another account it could not drop", () => {
    handOverFirstSave(REEL, null, "user_1");
    device.failing = true;
    expect(dropFirstSaveNotFor("user_2")).toBe(false);
  });
});

describe("a store that cannot be read", () => {
  it("reports it, shows the replay no work and no paywall, and keeps the record for the next launch", () => {
    finishHandoff(answers(["food"]), REEL);
    const attempted = readHandoffWork();
    const before = device.storage.get(KEY);
    device.unreadable = true;
    expect(readHandoffWork().has).toBe(false);
    expect(paywallBlocked()).toBe(true);
    expect(settleHandoff(attempted)).toBe("failed");
    finishHandoff(answers(["date"]), null);
    expect(captureError).toHaveBeenCalledWith(
      "onboarding_handoff_read_failed",
      expect.any(Error),
    );
    device.unreadable = false;
    expect(device.storage.get(KEY)).toBe(before);
  });
});

describe("settling while the store cannot be read", () => {
  it("never clears the record, even for the empty work an unreadable store showed", () => {
    finishHandoff(answers(["food"]), REEL);
    const before = device.storage.get(KEY);
    device.unreadable = true;
    expect(settleHandoff(readHandoffWork())).toBe("failed");
    device.unreadable = false;
    expect(device.storage.get(KEY)).toBe(before);
  });
});

describe("a record written by an older onboarding flow", () => {
  it("still hands an older finished record's spaces to the replay", () => {
    store({
      operationId: "legacy-operation",
      spaces: ["Recipes"],
      demoUrl: null,
      step: 7,
    });
    expect(readHandoffWork()).toMatchObject({
      has: true,
      operationId: "legacy-operation",
    });
  });

  it("drops its progress without waking the replay", () => {
    store({
      operationId: "legacy-operation",
      spaces: [],
      demoUrl: null,
      progressVersion: 14,
      step: 3,
    });
    const listener = vi.fn();
    const unsubscribe = subscribeHandoff(listener);
    dropLegacyProgress();
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
    expect(stored()).toMatchObject({ progressVersion: null, step: null });
  });

  it("is written back in the shape an older app reads", () => {
    finishHandoff(answers(["date"], false), REEL);
    expect(Object.keys(stored()).sort()).toEqual(
      [
        "beenCities",
        "declinedOperationId",
        "demoOwner",
        "demoSpace",
        "demoUrl",
        "goals",
        "operationId",
        "progressVersion",
        "savedCount",
        "skippedShare",
        "spaceNames",
        "spaces",
        "step",
        "travelCity",
        "viewed",
      ].sort(),
    );
    expect(stored()).toMatchObject({
      spaces: ["Date nights"],
      demoUrl: REEL,
      progressVersion: null,
    });
  });
});
