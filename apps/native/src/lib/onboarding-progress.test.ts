import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginProgress,
  canGoBack,
  canSkip,
  clearOnboardingProgress,
  isLeaving,
  loadOnboardingProgress,
  onboardingAnswers,
  transitionProgress,
  type OnboardingProgressState,
  type ProgressEvent,
  type ProgressTransition,
} from "./onboarding-progress";
import { GOALS } from "./onboarding-goals";
import {
  finishHandoff,
  handOverFirstSave,
  readHandoffWork,
} from "./onboarding-handoff";
import type { OnboardingStep } from "./onboarding-steps";

const storage = vi.hoisted(() => new Map<string, string>());
const failingKeys = vi.hoisted(() => new Set<string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (failingKeys.has(key)) throw new Error("keychain unavailable");
    storage.set(key, value);
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "new-operation-id" }));
const captureError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError },
}));

const PROGRESS_KEY = "shelvr.onboarding.progress";
const PENDING_KEY = "shelvr.pending.onboarding";

beforeEach(() => {
  storage.clear();
  failingKeys.clear();
  captureError.mockClear();
});

function at(
  step: OnboardingStep,
  changes: Partial<OnboardingProgressState> = {},
): OnboardingProgressState {
  return { ...beginProgress({ ...fresh(), step }, 0).state, ...changes };
}

function fresh() {
  return {
    step: "opener" as OnboardingStep,
    answers: {
      goals: [],
      savedCount: null,
      travelCity: null,
      beenCities: [],
      skippedShare: false,
    },
    viewed: [],
    completed: [],
  };
}

function run(
  state: OnboardingProgressState,
  ...events: ProgressEvent[]
): ProgressTransition {
  let result: ProgressTransition = { state, analytics: [], command: null };
  for (const event of events) {
    const next = transitionProgress(result.state, event, 1000);
    result = {
      state: next.state,
      analytics: [...result.analytics, ...next.analytics],
      command: next.command ?? result.command,
    };
  }
  return result;
}

const events = (result: ProgressTransition) =>
  result.analytics.map((entry) =>
    entry.event === "onboarding_notifications"
      ? `notifications:${entry.properties.action}`
      : `${entry.event === "onboarding_step_viewed" ? "viewed" : "completed"}:${entry.properties.step_id}${
          entry.event === "onboarding_step_completed" &&
          entry.properties.skipped
            ? ":skipped"
            : ""
        }`,
  );

describe("moving through the steps", () => {
  it("views the first step once when it begins", () => {
    const begun = beginProgress(null, 0);
    expect(begun.state.step).toBe("opener");
    expect(events(begun)).toEqual(["viewed:opener"]);
    expect(
      events(beginProgress({ ...fresh(), viewed: ["opener"] }, 0)),
    ).toEqual([]);
  });

  it("completes the step it leaves and views the next one", () => {
    const result = run(at("opener"), { type: "continue", from: "opener" });
    expect(result.state.step).toBe("savedCount");
    expect(events(result)).toEqual(["completed:opener", "viewed:saved_count"]);
    expect(result.analytics[0]).toMatchObject({
      properties: { duration_ms: 1000, skipped: false },
    });
  });

  it("ignores a second tap that names the step already left", () => {
    const result = run(
      at("goal"),
      { type: "continue", from: "goal" },
      { type: "continue", from: "goal" },
    );
    expect(result.state.step).toBe("been");
  });

  it("keeps an answer given with the tap that leaves the step", () => {
    const result = run(at("city"), {
      type: "continue",
      from: "city",
      answers: { travelCity: "tokyo" },
    });
    expect(result.state).toMatchObject({
      step: "cityEcho",
      answers: { travelCity: "tokyo" },
    });
  });

  it("sends each step's completion once, keeping the first one's skip", () => {
    const result = run(
      at("savedCount"),
      { type: "skip", from: "savedCount" },
      { type: "back", from: "goal" },
      { type: "continue", from: "savedCount" },
    );
    expect(events(result)).toEqual([
      "completed:saved_count:skipped",
      "viewed:goal",
    ]);
  });
});

describe("the skip row of each step", () => {
  it.each<[OnboardingStep, OnboardingStep, Record<string, unknown>]>([
    ["savedCount", "goal", {}],
    ["goal", "been", { goals: [...GOALS] }],
    ["been", "chart", { beenCities: [] }],
    ["chart", "city", {}],
    ["city", "cityEcho", { travelCity: null }],
    ["cityEcho", "ahaShare", {}],
    ["ahaShare", "ahaSpots", { skippedShare: true }],
    ["firstSave", "ahaSpots", {}],
    ["ahaSpots", "carousel", {}],
  ])("skips %s to %s", (from, to, answers) => {
    const result = run(
      at(from, {
        answers: {
          ...fresh().answers,
          travelCity: "lisbon",
          beenCities: ["lisbon"],
        },
      }),
      {
        type: "skip",
        from,
      },
    );
    expect(result.state.step).toBe(to);
    expect(result.state.answers).toMatchObject(answers);
    expect(result.command).toBeNull();
  });

  it("offers no skip on the opener", () => {
    const state = at("opener");
    expect(canSkip(state, false)).toBe(false);
    expect(run(state, { type: "skip", from: "opener" }).state).toBe(state);
  });

  it("asks for the plan when notifications are skipped, reporting the decline first", () => {
    const result = run(at("notifications"), {
      type: "skip",
      from: "notifications",
    });
    expect(events(result)).toEqual([
      "notifications:skip",
      "completed:notification_ask:skipped",
    ]);
    expect(result.command).toEqual({ kind: "askPaywall" });
    expect(result.state.step).toBe("notifications");
  });
});

describe("going back", () => {
  it("records nothing and views nothing already viewed", () => {
    const result = run(at("chart", { viewed: ["been", "chart"] }), {
      type: "back",
      from: "chart",
    });
    expect(result.state).toMatchObject({ step: "been", backward: true });
    expect(result.analytics).toEqual([]);
  });

  it("returns from the spots to the share step the user skipped", () => {
    const skipped = at("ahaSpots", {
      answers: { ...fresh().answers, skippedShare: true },
    });
    expect(run(skipped, { type: "back", from: "ahaSpots" }).state.step).toBe(
      "ahaShare",
    );
    expect(
      run(at("ahaSpots"), { type: "back", from: "ahaSpots" }).state.step,
    ).toBe("firstSave");
  });

  it("views the first save when a skipped share is shared after all", () => {
    const result = run(
      at("ahaShare", { viewed: ["ahaShare"] }),
      { type: "skip", from: "ahaShare" },
      { type: "back", from: "ahaSpots" },
      { type: "continue", from: "ahaShare", answers: { skippedShare: false } },
    );
    expect(result.state.step).toBe("firstSave");
    expect(events(result)).toContain("viewed:first_save");
  });

  it("is hidden on the opener and once the plan is asked for", () => {
    expect(canGoBack(at("opener"), false)).toBe(false);
    expect(canGoBack(at("goal"), false)).toBe(true);
    expect(canGoBack(at("goal"), true)).toBe(false);
  });
});

describe("leaving the carousel", () => {
  const checking = () =>
    run(at("carousel"), { type: "continue", from: "carousel" });

  it("checks the permission once, however often it is tapped", () => {
    const first = checking();
    expect(first.command).toEqual({
      kind: "checkPermission",
      visit: first.state.visit,
    });
    expect(isLeaving(first.state, false)).toBe(true);
    const again = run(
      first.state,
      { type: "continue", from: "carousel" },
      { type: "skip", from: "carousel" },
    );
    expect(again.state).toBe(first.state);
    expect(again.command).toBeNull();
  });

  it("moves to the notification ask when iOS can still ask", () => {
    const first = checking();
    const result = run(first.state, {
      type: "permission",
      visit: first.state.visit,
      canAsk: true,
    });
    expect(result.state.step).toBe("notifications");
    expect(events(result)).toEqual([
      "completed:carousel",
      "viewed:notification_ask",
    ]);
  });

  it("asks for the plan when iOS cannot ask, keeping the skip that started the check", () => {
    const first = run(at("carousel"), { type: "skip", from: "carousel" });
    const result = run(first.state, {
      type: "permission",
      visit: first.state.visit,
      canAsk: false,
    });
    expect(result.command).toEqual({ kind: "askPaywall" });
    expect(events(result)).toEqual(["completed:carousel:skipped"]);
    expect(isLeaving(result.state, false)).toBe(false);
  });

  it("ignores an answer that arrives after Back, or from an earlier visit", () => {
    const first = checking();
    const back = run(first.state, { type: "back", from: "carousel" });
    expect(back.state.lock).toBeNull();
    const returned = run(
      back.state,
      { type: "continue", from: "ahaSpots" },
      { type: "continue", from: "carousel" },
    );
    expect(returned.state.lock?.kind).toBe("checking");
    const late = run(returned.state, {
      type: "permission",
      visit: first.state.visit,
      canAsk: true,
    });
    expect(late.state).toBe(returned.state);
    const answered = run(returned.state, {
      type: "permission",
      visit: returned.state.visit,
      canAsk: true,
    });
    expect(answered.state.step).toBe("notifications");
  });
});

describe("asking for the plan", () => {
  it("asks again on a second tap after a closed paywall, sending no second completion", () => {
    const first = run(at("notifications"), {
      type: "continue",
      from: "notifications",
    });
    const again = run(first.state, { type: "continue", from: "notifications" });
    expect(again.command).toEqual({ kind: "askPaywall" });
    expect(again.analytics).toEqual([]);
  });

  it("hides Skip, not Back, while iOS shows its own prompt", () => {
    const asking = run(at("notifications"), {
      type: "prompting",
      asking: true,
    }).state;
    expect(canSkip(asking, false)).toBe(false);
    expect(canGoBack(asking, false)).toBe(true);
    expect(run(asking, { type: "prompting", asking: true }).state).toBe(asking);
    const away = run(asking, { type: "back", from: "notifications" }).state;
    const ended = run(away, { type: "prompting", asking: false }).state;
    expect(canSkip(ended, false)).toBe(true);
  });

  it("ends at finish, completing the step once and then ignoring every event", () => {
    const asked = run(at("notifications"), {
      type: "continue",
      from: "notifications",
    });
    const done = run(asked.state, { type: "finish" });
    expect(done.state.finished).toBe(true);
    expect(done.analytics).toEqual([]);
    expect(run(done.state, { type: "prompting", asking: false }).state).toBe(
      done.state,
    );
  });
});

describe("stored progress", () => {
  it("reads back only a record in this format, with steps this flow has", () => {
    storage.set(
      PROGRESS_KEY,
      JSON.stringify({
        format: 1,
        step: "city",
        goals: ["travel", "shopping"],
        travelCity: "atlantis",
        beenCities: ["madrid", "lisbon", "atlantis", "lisbon"],
        viewed: ["opener", "commitment", 3],
        completed: "opener",
      }),
    );
    expect(loadOnboardingProgress()).toEqual({
      step: "city",
      answers: {
        goals: ["travel"],
        savedCount: null,
        travelCity: null,
        beenCities: ["lisbon", "madrid"],
        skippedShare: false,
      },
      viewed: ["opener"],
      completed: [],
    });
    for (const raw of [
      "",
      "{broken",
      "null",
      JSON.stringify({ format: 2, step: "city" }),
      JSON.stringify({ format: 1, step: "commitment" }),
    ]) {
      storage.set(PROGRESS_KEY, raw);
      expect(loadOnboardingProgress()).toBeNull();
    }
  });

  it("starts fresh once cleared", () => {
    storage.set(PROGRESS_KEY, JSON.stringify({ format: 1, step: "city" }));
    clearOnboardingProgress();
    expect(loadOnboardingProgress()).toBeNull();
  });

  it("reports a clear that cannot be written instead of throwing", () => {
    failingKeys.add(PROGRESS_KEY);
    expect(() => clearOnboardingProgress()).not.toThrow();
    expect(captureError).toHaveBeenCalledWith(
      "onboarding_progress_clear_failed",
      expect.any(Error),
    );
  });
});

describe("progress written by the previous build", () => {
  const legacy = (record: Record<string, unknown>) =>
    storage.set(
      PENDING_KEY,
      JSON.stringify({
        operationId: "legacy-operation",
        spaces: ["Date nights"],
        demoUrl: "https://example.com/queued",
        spaceNames: { date: "Date nights" },
        progressVersion: 14,
        ...record,
      }),
    );

  it("resumes at its step with the steps before it viewed and completed", () => {
    legacy({
      step: 5,
      viewed: ["carousel"],
      goals: ["date"],
      beenCities: ["lisbon"],
      travelCity: "tokyo",
      savedCount: "hundreds",
    });
    expect(loadOnboardingProgress()).toEqual({
      step: "city",
      answers: {
        goals: ["date"],
        savedCount: "hundreds",
        travelCity: "tokyo",
        beenCities: ["lisbon"],
        skippedShare: false,
      },
      viewed: [
        "opener",
        "savedCount",
        "goal",
        "been",
        "chart",
        "city",
        "carousel",
      ],
      completed: ["opener", "savedCount", "goal", "been", "chart"],
    });
    expect(events(beginProgress(loadOnboardingProgress(), 0))).toEqual([]);
  });

  it("leaves the first save unviewed when the share was skipped", () => {
    legacy({ step: 9, skippedShare: true });
    const saved = loadOnboardingProgress();
    expect(saved?.viewed).not.toContain("firstSave");
    expect(saved?.completed).not.toContain("firstSave");
  });

  it("is taken once, keeping the handoff and dropping the old progress", () => {
    legacy({ step: 2, goals: ["date"] });
    loadOnboardingProgress();
    clearOnboardingProgress();
    expect(loadOnboardingProgress()).toBeNull();
    expect(readHandoffWork()).toMatchObject({
      operationId: "legacy-operation",
      firstSave: { url: "https://example.com/queued" },
    });
    expect(JSON.parse(storage.get(PENDING_KEY) ?? "{}")).toMatchObject({
      spaces: ["Date nights"],
    });
  });

  it("resumes in memory and keeps the old progress when the new key cannot be written", () => {
    legacy({ step: 5, goals: ["date"] });
    failingKeys.add(PROGRESS_KEY);
    expect(loadOnboardingProgress()?.step).toBe("city");
    expect(captureError).toHaveBeenCalledWith(
      "onboarding_progress_save_failed",
      expect.any(Error),
    );
    failingKeys.clear();
    expect(loadOnboardingProgress()?.step).toBe("city");
  });

  it("resumes when the old record cannot be cleared, and finish still drops it", () => {
    legacy({ step: 5, goals: ["date"] });
    failingKeys.add(PENDING_KEY);
    expect(loadOnboardingProgress()?.step).toBe("city");
    expect(captureError).toHaveBeenCalledWith(
      "onboarding_legacy_progress_drop_failed",
      expect.any(Error),
    );
    failingKeys.clear();
    finishHandoff(
      {
        goals: ["date"],
        savedCount: null,
        travelCity: null,
        beenCities: [],
        skippedShare: false,
      },
      null,
    );
    clearOnboardingProgress();
    expect(loadOnboardingProgress()).toBeNull();
  });

  it.each([undefined, 12, 13, "14"])(
    "is not taken from a record of version %s",
    (progressVersion) => {
      legacy({ step: 2, progressVersion });
      expect(loadOnboardingProgress()).toBeNull();
    },
  );
});

describe("the answers the paywall echoes", () => {
  it("come from progress, then from the handoff once onboarding finished", () => {
    expect(onboardingAnswers()).toMatchObject({ goals: [], travelCity: null });
    storage.set(
      PROGRESS_KEY,
      JSON.stringify({
        format: 1,
        step: "carousel",
        goals: ["travel"],
        travelCity: "tokyo",
      }),
    );
    expect(onboardingAnswers()).toMatchObject({
      goals: ["travel"],
      travelCity: "tokyo",
    });
    finishHandoff(
      {
        goals: ["travel"],
        savedCount: null,
        travelCity: "tokyo",
        beenCities: ["lisbon"],
        skippedShare: false,
      },
      null,
    );
    clearOnboardingProgress();
    handOverFirstSave("https://example.com/reel");
    expect(onboardingAnswers()).toMatchObject({
      goals: ["travel"],
      travelCity: "tokyo",
      beenCities: ["lisbon"],
    });
  });
});
