// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TidyPhoto } from "./use-photo-batch";
import { useTidyActions } from "./use-tidy-actions";

const mocks = vi.hoisted(() => ({
  deleteAssets: vi.fn(async (_assets: unknown[]) => undefined),
  store: new Map<string, unknown>(),
}));

vi.mock("expo-media-library", () => {
  class Asset {
    static delete = mocks.deleteAssets;
    constructor(public id: string) {}
    getUri = async () => this.id;
    getLocation = async () => null;
  }
  return { Asset };
});
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("@/lib/use-save-image", () => ({ useSaveImages: () => vi.fn() }));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    contains: (key: string) => mocks.store.has(key),
    set: (key: string, value: unknown) => mocks.store.set(key, value),
    remove: (key: string) => mocks.store.delete(key),
    getString: (key: string) => mocks.store.get(key) as string | undefined,
  }),
}));

const batch: TidyPhoto[] = Array.from({ length: 24 }, (_, index) => ({
  id: `ph://photo-${index}`,
  width: 100,
  height: 100,
  creationTime: index,
}));

function setup() {
  const noteDeleted = vi.fn();
  const hook = renderHook(() => useTidyActions({ batch, noteDeleted }));
  return { ...hook, noteDeleted };
}

beforeEach(() => {
  mocks.store.clear();
  mocks.deleteAssets.mockReset().mockResolvedValue(undefined);
});

describe("undo after a committed delete", () => {
  // The deck re-inserts `currentIndex + 1` on every undo, so the hook may
  // only hand back the card right above the top one, or nothing.
  it("offers nothing to undo when the kept card sits above a committed delete", async () => {
    const { result } = setup();
    act(() => result.current.onDecision(23, "keep"));
    act(() => result.current.onDecision(22, "delete"));
    await act(async () => {
      await result.current.commitDeletes();
    });
    expect(mocks.deleteAssets).toHaveBeenCalledTimes(1);
    expect(result.current.topIndex).toBe(21);
    expect(result.current.canUndo).toBe(false);

    let undone: number | null = 0;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBeNull();
    expect(result.current.topIndex).toBe(21);
  });

  it("keeps undoing the decisions made after the last committed delete", async () => {
    const { result } = setup();
    act(() => result.current.onDecision(23, "delete"));
    act(() => result.current.onDecision(22, "keep"));
    act(() => result.current.onDecision(21, "delete"));
    act(() => result.current.onDecision(20, "keep"));
    await act(async () => {
      await result.current.commitDeletes();
    });
    expect(result.current.canUndo).toBe(true);

    let undone: number | null = null;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe(20);
    expect(result.current.topIndex).toBe(20);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.counts.kept).toBe(1);
  });

  it("keeps a delete decided while the dialog was open undoable", async () => {
    let finishDelete: () => void = () => undefined;
    mocks.deleteAssets.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishDelete = () => resolve(undefined);
        }),
    );
    const { result } = setup();
    act(() => result.current.onDecision(23, "delete"));
    let commit: Promise<void> = Promise.resolve();
    act(() => {
      commit = result.current.commitDeletes();
    });
    // The system dialog is open; the user swipes one more card away.
    act(() => result.current.onDecision(22, "delete"));
    expect(result.current.pendingDeleteCount).toBe(1);
    await act(async () => {
      finishDelete();
      await commit;
    });
    expect(result.current.pendingDeleteCount).toBe(1);
    expect(result.current.canUndo).toBe(true);

    let undone: number | null = null;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe(22);
    expect(result.current.pendingDeleteCount).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });

  it("trims from the cutoff read before the dialog even if that entry was undone meanwhile", async () => {
    let finishDelete: () => void = () => undefined;
    mocks.deleteAssets.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishDelete = () => resolve(undefined);
        }),
    );
    const { result } = setup();
    act(() => result.current.onDecision(23, "keep"));
    act(() => result.current.onDecision(22, "delete"));
    let commit: Promise<void> = Promise.resolve();
    act(() => {
      commit = result.current.commitDeletes();
    });
    // The dialog is open and the queued delete gets undone underneath it.
    act(() => result.current.undo());
    await act(async () => {
      finishDelete();
      await commit;
    });
    // Card 22 is gone either way, so the keep above it is not undoable.
    expect(result.current.canUndo).toBe(false);
    expect(result.current.undo()).toBeNull();
  });

  it("keeps the whole history when the delete dialog is cancelled", async () => {
    mocks.deleteAssets.mockRejectedValueOnce(new Error("cancelled"));
    const { result } = setup();
    act(() => result.current.onDecision(23, "keep"));
    act(() => result.current.onDecision(22, "delete"));
    await act(async () => {
      await result.current.commitDeletes();
    });
    expect(result.current.pendingDeleteCount).toBe(1);
    expect(result.current.canUndo).toBe(true);

    let undone: number | null = null;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe(22);
    expect(result.current.pendingDeleteCount).toBe(0);
  });
});
