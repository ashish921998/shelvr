// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type { DetailItem } from "@/components/item-detail";
import { useSaveActions } from "@/lib/use-save-actions";

const mocks = vi.hoisted(() => ({
  share: vi.fn(),
  deleteItem: vi.fn(async () => undefined),
  copy: vi.fn(async () => undefined),
  confirm: vi.fn(),
  alert: vi.fn(),
  forget: vi.fn(),
  deleted: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("@/lib/use-item-share", () => ({ useItemShare: () => mocks.share }));
vi.mock("convex/react", () => ({ useMutation: () => mocks.deleteItem }));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { deleteItem: "deleteItem" } },
}));
vi.mock("expo-clipboard", () => ({ setStringAsync: mocks.copy }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@/lib/confirm-item-delete", () => ({
  confirmItemDelete: (onConfirm: () => unknown) => {
    mocks.confirm();
    return onConfirm();
  },
}));
vi.mock("@/lib/share/share-store", () => ({
  forgetDeletedSharedItem: mocks.forget,
}));
vi.mock("@/lib/haptics", () => ({ haptics: { success: vi.fn() } }));
vi.mock("@/lib/analytics", () => ({
  analytics: {
    capture: vi.fn(),
    itemAction: vi.fn(),
    itemDeleted: mocks.deleted,
    captureError: mocks.captureError,
  },
}));

const item = (url?: string) => ({ _id: "abc", url }) as unknown as DetailItem;

beforeEach(() => vi.clearAllMocks());

it("lists Share, Copy link and Delete for a link save", () => {
  const { result } = renderHook(() =>
    useSaveActions(item("https://a.example"), "feed"),
  );
  expect(result.current.actions.map((action) => action.label)).toEqual([
    "Share",
    "Copy link",
    "Delete",
  ]);
  expect(result.current.actions[2]?.destructive).toBe(true);
});

it("has no Copy link without a url", () => {
  const { result } = renderHook(() => useSaveActions(item(), "feed"));
  expect(result.current.actions.map((action) => action.label)).toEqual([
    "Share",
    "Delete",
  ]);
});

it("copies the link", async () => {
  const { result } = renderHook(() =>
    useSaveActions(item("https://a.example"), "feed"),
  );
  await act(() => result.current.copyLink());
  expect(mocks.copy).toHaveBeenCalledWith("https://a.example");
});

it("asks before deleting, then deletes and reports the surface", async () => {
  const onRemoved = vi.fn();
  const beforeRemove = vi.fn();
  const { result } = renderHook(() =>
    useSaveActions(item(), "feed", { beforeRemove, onRemoved }),
  );
  await act(async () => result.current.remove());
  expect(mocks.confirm).toHaveBeenCalled();
  expect(beforeRemove).toHaveBeenCalled();
  expect(mocks.deleteItem).toHaveBeenCalledWith({ id: "abc" });
  expect(mocks.forget).toHaveBeenCalledWith("abc");
  expect(mocks.deleted).toHaveBeenCalledWith(expect.anything(), "feed");
  expect(onRemoved).toHaveBeenCalled();
});

it("reports and alerts, then skips the follow-up when the delete fails", async () => {
  const failure = new Error("no");
  mocks.deleteItem.mockRejectedValueOnce(failure);
  const onRemoved = vi.fn();
  const { result } = renderHook(() =>
    useSaveActions(item(), "feed", { onRemoved }),
  );
  await act(async () => result.current.remove());
  expect(mocks.captureError).toHaveBeenCalledWith(
    "item_delete_failed",
    failure,
  );
  expect(mocks.alert).toHaveBeenCalled();
  expect(onRemoved).not.toHaveBeenCalled();
});
