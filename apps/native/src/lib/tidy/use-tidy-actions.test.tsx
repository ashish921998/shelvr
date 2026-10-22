// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TidyPhoto } from "./use-photo-batch";
import { useTidyActions } from "./use-tidy-actions";

const mocks = vi.hoisted(() => ({
  deleteAssets: vi.fn(async (_assets: unknown[]) => undefined),
  store: new Map<string, unknown>(),
  saveImages: vi.fn(),
  deleteItem: vi.fn(),
  alert: vi.fn(),
  captureError: vi.fn(),
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
vi.mock("convex/react", () => ({ useMutation: () => mocks.deleteItem }));
vi.mock("@/lib/use-save-image", () => ({
  useSaveImages: () => mocks.saveImages,
}));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
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
  mocks.saveImages.mockReset();
  mocks.deleteItem.mockReset().mockResolvedValue(null);
  mocks.alert.mockReset();
  mocks.captureError.mockReset();
});

describe("saving from Tidy", () => {
  it("takes a save that failed back out of the saved count", async () => {
    mocks.saveImages.mockResolvedValue([
      { status: "failed", stage: "upload", operationId: "op" },
    ]);
    const { result } = setup();
    await act(async () => result.current.onDecision(23, "save"));
    expect(result.current.counts.saved).toBe(0);
  });

  it("counts a failed save that was also undone only once", async () => {
    let fail!: () => void;
    mocks.saveImages.mockReturnValue(
      new Promise((resolve) => {
        fail = () => resolve([{ status: "failed", stage: "upload" }]);
      }),
    );
    const { result } = setup();
    await act(async () => result.current.onDecision(23, "save"));
    act(() => {
      result.current.undo();
    });
    expect(result.current.counts.saved).toBe(0);
    await act(async () => fail());
    expect(result.current.counts.saved).toBe(0);
  });

  it("says so when undoing a save can't remove it from Shelvr", async () => {
    mocks.saveImages.mockResolvedValue([{ status: "saved", itemId: "item-1" }]);
    mocks.deleteItem.mockRejectedValue(new Error("offline"));
    const { result } = setup();
    await act(async () => result.current.onDecision(23, "save"));
    await act(async () => {
      result.current.undo();
    });
    expect(mocks.deleteItem).toHaveBeenCalledWith({ id: "item-1" });
    expect(result.current.counts.saved).toBe(0);
    expect(mocks.captureError).toHaveBeenCalledWith(
      "tidy_undo_save_failed",
      expect.any(Error),
    );
    expect(mocks.alert).toHaveBeenCalledWith(
      "item.deleteFailed",
      "errors.retrySoon",
    );
  });
});

describe("undo after a committed delete", () => {
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
    act(() => result.current.undo());
    await act(async () => {
      finishDelete();
      await commit;
    });
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
