// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useConvexQueryHealing } from "./convex-query-healing";

const mock = vi.hoisted(() => ({
  isAuthenticated: false,
  observe: vi.fn(() => vi.fn()),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mock.isAuthenticated }),
}));
vi.mock("@/lib/query-auth-recovery", () => ({
  observeAuthQueryErrors: mock.observe,
}));
vi.mock("@/lib/query-client", () => ({
  queryClient: { id: "queryClient" },
  restartConvexSubscription: "restart",
}));

describe("useConvexQueryHealing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.isAuthenticated = false;
  });

  it("does not observe query errors while signed out", () => {
    renderHook(() => useConvexQueryHealing()).unmount();
    expect(mock.observe).not.toHaveBeenCalled();
  });

  it("watches errored queries with the shared client and stops on unmount", () => {
    mock.isAuthenticated = true;
    const hook = renderHook(() => useConvexQueryHealing());
    expect(mock.observe).toHaveBeenCalledOnce();
    expect(mock.observe).toHaveBeenCalledWith({ id: "queryClient" }, "restart");
    const unsubscribe = mock.observe.mock.results[0]?.value as () => void;
    hook.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
