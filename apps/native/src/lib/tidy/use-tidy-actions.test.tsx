// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TidyPhoto } from "./use-photo-batch";
import { useTidyActions } from "./use-tidy-actions";

const mocks = vi.hoisted(() => ({
  saveImages: vi.fn(),
  deleteItem: vi.fn(),
  store: new Map<string, unknown>(),
}));

vi.mock("expo-media-library", () => {
  class Asset {
    static delete = async () => undefined;
    constructor(public id: string) {}
    getUri = async () => this.id;
    getLocation = async () => null;
  }
  return { Asset };
});
vi.mock("convex/react", () => ({ useMutation: () => mocks.deleteItem }));
vi.mock("@/lib/use-save-image", () => ({
  useSaveImages: () => mocks.saveImages,
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    contains: (key: string) => mocks.store.has(key),
    set: (key: string, value: unknown) => mocks.store.set(key, value),
    remove: (key: string) => mocks.store.delete(key),
    getString: (key: string) => mocks.store.get(key) as string | undefined,
  }),
}));

const batch: TidyPhoto[] = Array.from({ length: 4 }, (_, index) => ({
  id: `ph://photo-${index}`,
  width: 100,
  height: 100,
  creationTime: index,
}));

type SaveResult = { status: "saved"; itemId: string } | { status: "failed" };

/** The upload starts after the asset's uri resolves, so the settle handle is
 * only live after a `flush()`. */
function deferredSave() {
  let settle: (result: SaveResult) => void = () => {
    throw new Error("saveImages has not been called yet");
  };
  mocks.saveImages.mockImplementationOnce(
    () =>
      new Promise<SaveResult[]>((resolve) => {
        settle = (result) => resolve([result]);
      }),
  );
  return (result: SaveResult) => settle(result);
}

function setup() {
  return renderHook(() => useTidyActions({ batch, noteDeleted: vi.fn() }));
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  mocks.store.clear();
  mocks.saveImages.mockReset();
  mocks.deleteItem.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("the saved count", () => {
  it("counts a save the moment it is decided and keeps it once it lands", async () => {
    const settle = deferredSave();
    const { result } = setup();
    act(() => result.current.onDecision(3, "save"));
    expect(result.current.counts.saved).toBe(1);
    await flush();
    settle({ status: "saved", itemId: "item_1" });
    await flush();
    expect(result.current.counts.saved).toBe(1);
  });

  it("takes a failed save back out of the summary", async () => {
    const settle = deferredSave();
    const { result } = setup();
    act(() => result.current.onDecision(3, "save"));
    expect(result.current.counts.saved).toBe(1);
    await flush();
    settle({ status: "failed" });
    await flush();
    expect(result.current.counts.saved).toBe(0);
  });

  it("takes a save that threw back out of the summary", async () => {
    mocks.saveImages.mockRejectedValueOnce(new Error("offline"));
    const { result } = setup();
    act(() => result.current.onDecision(3, "save"));
    await flush();
    expect(result.current.counts.saved).toBe(0);
  });

  it("does not count a save undone before its failure lands twice", async () => {
    const settle = deferredSave();
    const { result } = setup();
    act(() => result.current.onDecision(3, "keep"));
    act(() => result.current.onDecision(2, "save"));
    await flush();
    act(() => result.current.undo());
    expect(result.current.counts.saved).toBe(0);
    settle({ status: "failed" });
    await flush();
    expect(result.current.counts.saved).toBe(0);
    expect(result.current.counts.kept).toBe(1);
  });

  it("does not count a save undone after its failure landed twice", async () => {
    const settle = deferredSave();
    const { result } = setup();
    act(() => result.current.onDecision(3, "keep"));
    act(() => result.current.onDecision(2, "save"));
    await flush();
    settle({ status: "failed" });
    await flush();
    expect(result.current.counts.saved).toBe(0);
    act(() => result.current.undo());
    expect(result.current.counts.saved).toBe(0);
    expect(result.current.counts.kept).toBe(1);
    expect(mocks.deleteItem).not.toHaveBeenCalled();
  });
});
