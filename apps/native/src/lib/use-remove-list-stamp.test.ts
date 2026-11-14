// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRemoveListStamp } from "@/lib/use-remove-list-stamp";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  alert: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("convex/react", () => ({ useMutation: () => mocks.remove }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useRemoveListStamp", () => {
  it("takes the stamp out by its place name", async () => {
    mocks.remove.mockResolvedValue(null);
    const { result } = renderHook(() => useRemoveListStamp());
    let removed = false;
    await act(async () => {
      removed = await result.current("Manteigaria");
    });
    expect(removed).toBe(true);
    expect(mocks.remove).toHaveBeenCalledWith({ name: "Manteigaria" });
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it("reports a failure and keeps the sheet open", async () => {
    mocks.remove.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useRemoveListStamp());
    let removed = true;
    await act(async () => {
      removed = await result.current("Manteigaria");
    });
    expect(removed).toBe(false);
    expect(mocks.captureError).toHaveBeenCalledWith(
      "list_stamp_remove_failed",
      expect.any(Error),
    );
    expect(mocks.alert).toHaveBeenCalled();
  });
});
