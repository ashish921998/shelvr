// Tests for the pure runImageBatch protocol. The React adapter
// (useSaveImageBatch) and the React Native / expo-router modules it binds are
// not exercised here — only the dependency-injected protocol, which is where
// the operation-id-reusing retry and the paywall precedence live. Runs in the
// Node default env.
import { describe, expect, it, vi } from "vitest";
import { runImageBatch, type ImageBatchDeps } from "./use-save-image-batch";
import type { ImageSaveRequest, ImageSaveResult } from "./use-save-image";

// Stubbed at the module boundary so the module under test loads under Node
// without a React Native runtime. `reportSaveFailures` has its own analytics
// coverage in use-save-image.test.ts; here it only needs to be observable.
const reportSaveFailures = vi.fn();
vi.mock("./use-save-image", () => ({
  reportSaveFailures: (results: ImageSaveResult[]) =>
    reportSaveFailures(results),
  useSaveImages: vi.fn(),
}));
vi.mock("@/lib/entitlement", () => ({ openPaywall: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: vi.fn() }));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));

type AlertCall = {
  title: string;
  message: string;
  buttons: { text: string; onPress?: () => void }[];
};

const saved = (uri: string, operationId: string): ImageSaveResult => ({
  status: "saved",
  operationId,
  image: { uri },
  itemId: "ks_item" as never,
});

const failure = (
  uri: string,
  operationId: string,
  overrides: Partial<Extract<ImageSaveResult, { status: "failed" }>> = {},
): ImageSaveResult => ({
  status: "failed",
  operationId,
  image: { uri },
  stage: "upload",
  message: "Could not complete (upload)",
  ...overrides,
});

/** Builds deps plus the recorders a test asserts on. `batches` is the queue of
 * results `saveImages` returns, one entry per call, so a test can script a
 * first run that partly fails and a retry that succeeds. */
function harness(batches: ImageSaveResult[][]) {
  const calls: ImageSaveRequest[][] = [];
  const alerts: AlertCall[] = [];
  const busy: boolean[] = [];
  const allSaved: ImageSaveResult[][] = [];
  const openPaywall = vi.fn(async () => undefined);
  const onDismiss = vi.fn();
  const onUnexpectedError = vi.fn();
  const spaceIds: (string | undefined)[] = [];

  const deps: ImageBatchDeps = {
    saveImages: async (requests, options) => {
      calls.push(requests);
      spaceIds.push(options?.spaceId);
      return batches[calls.length - 1] ?? [];
    },
    alert: (title, message, buttons) =>
      alerts.push({ title, message, buttons }),
    openPaywall,
    setBusy: (value) => busy.push(value),
    onAllSaved: (results) => allSaved.push(results),
    onDismiss,
    onUnexpectedError,
  };
  return {
    deps,
    calls,
    alerts,
    busy,
    allSaved,
    openPaywall,
    onDismiss,
    onUnexpectedError,
    spaceIds,
  };
}

const request = (uri: string): ImageSaveRequest => ({ image: { uri } });

describe("runImageBatch", () => {
  it("retries only the failed requests, reusing their operation ids", async () => {
    const h = harness([
      [
        saved("a", "image:op-a"),
        failure("b", "image:op-b"),
        failure("c", "image:op-c"),
      ],
      [saved("b", "image:op-b"), saved("c", "image:op-c")],
    ]);
    await runImageBatch(["a", "b", "c"].map(request), h.deps);

    // The partial outcome is alerted, not swallowed.
    expect(h.alerts).toHaveLength(1);
    const retry = h.alerts[0].buttons[0];
    expect(retry.text).toBe("Retry failed");

    retry.onPress?.();
    await vi.waitFor(() => expect(h.calls).toHaveLength(2));

    // The retry resubmits ONLY the two failures, each carrying the exact
    // operation id its failed result reported. A fresh id here would start a
    // second server operation per image instead of resuming the first.
    expect(h.calls[1]).toEqual([
      { image: { uri: "b" }, operationId: "image:op-b" },
      { image: { uri: "c" }, operationId: "image:op-c" },
    ]);
    expect(h.calls[1].map((r) => r.operationId)).toEqual([
      "image:op-b",
      "image:op-c",
    ]);
    // The successful sibling is never resubmitted.
    expect(h.calls[1].some((r) => r.image.uri === "a")).toBe(false);
    // The retry saving everything is what finally reports an all-saved batch.
    expect(h.allSaved).toHaveLength(1);
    expect(h.alerts).toHaveLength(1);
  });

  it("fires the all-saved callback exactly once and shows no alert", async () => {
    const h = harness([[saved("a", "image:op-a"), saved("b", "image:op-b")]]);
    await runImageBatch(["a", "b"].map(request), h.deps);

    expect(h.allSaved).toHaveLength(1);
    expect(h.allSaved[0]).toHaveLength(2);
    expect(h.alerts).toEqual([]);
    expect(h.onDismiss).not.toHaveBeenCalled();
    expect(h.openPaywall).not.toHaveBeenCalled();
    // Busy stays set on the way out: the host screen closes rather than
    // returning to an idle state.
    expect(h.busy).toEqual([true]);
  });

  it("routes a pro_required refusal to the paywall instead of the alert", async () => {
    const h = harness([
      [
        saved("a", "image:op-a"),
        failure("b", "image:op-b", { code: "pro_required" }),
      ],
    ]);
    await runImageBatch(["a", "b"].map(request), h.deps);

    expect(h.openPaywall).toHaveBeenCalledTimes(1);
    // Precedence: the partial-failure alert must not also appear.
    expect(h.alerts).toEqual([]);
    expect(h.allSaved).toEqual([]);
    expect(h.busy).toEqual([true, false]);
  });

  it("reports every failure and passes the pinned space through", async () => {
    const h = harness([[failure("a", "image:op-a")]]);
    reportSaveFailures.mockClear();
    await runImageBatch([request("a")], {
      ...h.deps,
      spaceId: "ks_space" as never,
    });

    expect(h.spaceIds).toEqual(["ks_space"]);
    expect(reportSaveFailures).toHaveBeenCalledTimes(1);
    expect(h.alerts[0].title).toBe("Could not save all images");
    expect(h.alerts[0].message).toContain("0 of 1 saved.");
    // The dismissal button is the host's, not a retry.
    h.alerts[0].buttons[1].onPress?.();
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
    expect(h.busy).toEqual([true, false]);
  });

  it("hands a thrown batch to the host and clears busy", async () => {
    const h = harness([]);
    const boom = new Error("network down");
    await runImageBatch([request("a")], {
      ...h.deps,
      saveImages: async () => {
        throw boom;
      },
    });

    expect(h.onUnexpectedError).toHaveBeenCalledWith(boom);
    expect(h.alerts).toEqual([]);
    expect(h.busy).toEqual([true, false]);
  });

  it("short-circuits an empty batch without touching the backend", async () => {
    const h = harness([]);
    await runImageBatch([], h.deps);

    expect(h.calls).toEqual([]);
    expect(h.allSaved).toEqual([[]]);
    expect(h.busy).toEqual([]);
  });
});
