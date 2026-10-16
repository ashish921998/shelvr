// @vitest-environment jsdom
import { act, render, renderHook } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppIntentsBridge, useAppIntentsSignOutReset } from "./app-intents";

const mock = vi.hoisted(() => ({
  authenticated: false,
  pending: [] as {
    id: string;
    name: string;
    params: object;
    createdAt: number;
  }[],
  handler: null as null | ((pending: unknown[]) => Promise<void>),
  createNote: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  clearPending: vi.fn(async () => undefined),
  store: new Map<string, string>(),
}));

vi.mock("expo-app-intents", () => ({
  isAvailable: () => true,
  // Shaped like the real hook: the queue is delivered once per mount, and
  // later deliveries reach the latest handler through a ref.
  useAppIntents: (handler: (pending: unknown[]) => Promise<void>) => {
    const handlerRef = useRef(handler);
    useEffect(() => {
      handlerRef.current = handler;
    }, [handler]);
    useEffect(() => {
      mock.handler = (pending) => handlerRef.current(pending);
      void handlerRef.current(mock.pending);
    }, []);
  },
  getPendingInvocationsAsync: async () => mock.pending,
  removePendingInvocationAsync: mock.remove,
  clearPendingInvocationsAsync: mock.clearPending,
  setEntityCatalogAsync: async () => undefined,
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
}));
vi.mock("expo-file-system", () => ({
  Directory: class {
    exists = false;
  },
  File: class {},
  Paths: { cache: "/cache" },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ navigate: vi.fn(), push: vi.fn() }),
  useNavigationContainerRef: () => ({ isReady: () => true }),
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    contains: (key: string) => mock.store.has(key),
    set: (key: string, value: string) => mock.store.set(key, value),
    remove: (key: string) => mock.store.delete(key),
    getString: (key: string) => mock.store.get(key),
  }),
}));
vi.mock("react-native-nitro-image", () => ({ Images: {} }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: mock.authenticated,
    isLoading: false,
  }),
  useMutation: (ref: string) =>
    ref === "createNote" ? mock.createNote : vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    items: { createNoteItem: "createNote", createLinkItem: "createLink" },
    spaces: { listSpaces: "spaces" },
    appIntents: { issueCaptureToken: "token" },
  },
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: vi.fn() },
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: undefined }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({ entitled: false, loading: true }),
}));
vi.mock("@/lib/home-feed", () => ({
  useHomeFeed: () => ({
    items: undefined,
    canLoadMore: false,
    loadingMore: false,
    loadMore: vi.fn(),
  }),
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/url", () => ({ displayHost: (url: string) => url }));
vi.mock("@/lib/use-save-image", () => ({ useSaveImages: () => vi.fn() }));

const note = {
  id: "inv-1",
  name: "saveNote",
  params: { text: "book the dentist" },
  createdAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.authenticated = false;
  mock.pending = [note];
  mock.handler = null;
  mock.store.clear();
});

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

describe("a capture Siri queued while nobody was signed in", () => {
  it("waits for sign-in, then saves it", async () => {
    const view = render(<AppIntentsBridge />);
    await settle();
    expect(mock.createNote).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();

    mock.authenticated = true;
    view.rerender(<AppIntentsBridge />);
    await settle();

    expect(mock.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ text: "book the dentist", saveSource: "siri" }),
    );
    expect(mock.remove).toHaveBeenCalledWith("inv-1");
  });

  it("survives the signed-out reset when no account owned the device", async () => {
    renderHook(() => useAppIntentsSignOutReset());
    await settle();
    expect(mock.clearPending).not.toHaveBeenCalled();
  });

  it("is dropped with the account that was signed out", async () => {
    mock.store.set("captureOwner", "user_1");
    renderHook(() => useAppIntentsSignOutReset());
    await settle();
    expect(mock.clearPending).toHaveBeenCalledOnce();
    expect(mock.store.has("captureOwner")).toBe(false);
  });

  it("is dropped on sign-out even when that account never got a capture token", async () => {
    mock.authenticated = true;
    const view = renderHook(() => useAppIntentsSignOutReset());
    await settle();
    expect(mock.clearPending).not.toHaveBeenCalled();

    mock.authenticated = false;
    view.rerender();
    await settle();
    expect(mock.clearPending).toHaveBeenCalledOnce();
  });

  it("is delivered once when the account was already signed in at launch", async () => {
    mock.authenticated = true;
    render(<AppIntentsBridge />);
    await settle();
    expect(mock.createNote).toHaveBeenCalledOnce();
  });
});
