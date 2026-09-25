// @vitest-environment jsdom
// A lapsed user sharing into Shelvr must reach exactly one paywall per share
// session, however many times the save effect re-runs before they decide, and
// the save must still start once the purchase lands.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import ShareScreen from "@/app/(app)/share";
import { analytics } from "@/lib/analytics";
import {
  fingerprintSharePayloads,
  LAST_COMPLETED_SHARE_KEY,
  recordCompletedShare,
} from "@/lib/share/storage";
import {
  DISCARDED_SHARE_KEY,
  PENDING_SHARE_KEY,
} from "@/lib/share/pending-share";
import {
  hasPendingShareOnDevice,
  markPendingShareOnDevice,
  markShareDiscardedOnDevice,
} from "@/lib/share/pending-share-store";
import { hasResumableSharedPayloads } from "@/lib/share/resumable-payloads";

type RawPayload = { value: string; shareType: string; mimeType?: string };

const mock = vi.hoisted(() => ({
  entitled: false,
  entitlementLoading: false,
  user: { _id: "user-1" },
  sharedPayloads: [] as RawPayload[],
  resolvedSharedPayloads: [] as unknown[],
  isResolving: false,
  openPaywall: vi.fn(),
  createLinkItem: vi.fn(),
  createNoteItem: vi.fn(),
  saveImages: vi.fn(),
  clearSharedPayloads: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
  store: new Map<string, string>(),
  // SecureStore: the pending flag and the discard record run through the real
  // pending-share rules and the real device binding.
  secure: new Map<string, string>(),
  uuid: 0,
  platform: "android",
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
  localizeError: (message: string) => message,
}));
vi.mock("@/lib/first-share", () => ({ recordShareSaved: vi.fn() }));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.secure.get(key) ?? null,
  setItem: (key: string, value: string) => mock.secure.set(key, value),
}));
vi.mock("@/lib/use-save-image", () => ({
  useSaveImages: () => mock.saveImages,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: {
    capture: vi.fn(),
    captureError: vi.fn(),
    sessionId: () => undefined,
  },
}));
vi.mock("@/lib/entitlement", () => ({
  openPaywall: mock.openPaywall,
  useEntitlement: () => ({
    entitled: mock.entitled,
    loading: mock.entitlementLoading,
  }),
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: mock.user }),
}));
vi.mock("@/lib/motion", () => ({
  motion: {
    duration: { feedback: 120, state: 180, enter: 250, exit: 200 },
    easing: { out: {} },
    scale: { pressed: 0.97, enter: 0.95 },
  },
  motionCSS: { out: "" },
  REDUCED_FADE_IN: {},
  REDUCED_FADE_OUT: {},
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    items: {
      createLinkItem: "createLinkItem",
      createNoteItem: "createNoteItem",
    },
  },
}));
vi.mock("convex/react", () => ({
  useMutation: (ref: string) =>
    ref === "createLinkItem" ? mock.createLinkItem : mock.createNoteItem,
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => `session-${++mock.uuid}`,
}));
vi.mock("expo-router", () => ({ useRouter: () => mock.router }));
vi.mock("expo-sharing", () => ({
  useIncomingShare: () => ({
    sharedPayloads: mock.sharedPayloads,
    resolvedSharedPayloads: mock.resolvedSharedPayloads,
    isResolving: mock.isResolving,
    error: null,
    clearSharedPayloads: mock.clearSharedPayloads,
  }),
  // The native store the resume path reads. Clears are mocked, so it keeps
  // whatever batch the test put there.
  getSharedPayloads: () => mock.sharedPayloads,
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => mock.store.get(key),
    set: (key: string, value: string) => mock.store.set(key, value),
    remove: (key: string) => mock.store.delete(key),
    contains: (key: string) => mock.store.has(key),
  }),
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    )),
  },
  Keyframe: class {
    duration() {
      return this;
    }
  },
  useReducedMotion: () => false,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => () => ({}) }) },
  useUnistyles: () => ({ theme: { colors: { primary: "" } } }),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: vi.fn(() => null),
  Platform: {
    get OS() {
      return mock.platform;
    },
  },
  Pressable: vi.fn(
    ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
      <button onClick={onPress}>{children}</button>
    ),
  ),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
}));

const link: RawPayload = {
  value: "https://example.com/a",
  shareType: "url",
  mimeType: "text/plain",
};
const resolvedLink = {
  contentType: "website",
  value: link.value,
  contentUri: null,
  contentMimeType: link.mimeType,
};

// The effect defers runSave to a microtask; a macrotask tick lets it settle
// before a negative assertion.
const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  vi.clearAllMocks();
  mock.entitled = false;
  mock.entitlementLoading = false;
  mock.sharedPayloads = [link];
  mock.resolvedSharedPayloads = [];
  mock.isResolving = false;
  mock.store.clear();
  mock.secure.clear();
  mock.uuid = 0;
  mock.platform = "android";
  mock.openPaywall.mockResolvedValue(false);
  mock.createLinkItem.mockResolvedValue("item-1");
});

it("presents one paywall per session across effect re-runs and saves once entitled", async () => {
  const view = render(<ShareScreen />);
  await waitFor(() => expect(mock.openPaywall).toHaveBeenCalledTimes(1));
  expect(mock.openPaywall).toHaveBeenCalledWith(mock.router, "share");
  expect(screen.getByText("pro.unlockShelvr")).toBeDefined();

  // Native resolution completes after mount: the processor payload list
  // changes identity and the save effect re-runs for the same session.
  mock.resolvedSharedPayloads = [resolvedLink];
  view.rerender(<ShareScreen />);
  await settle();
  expect(mock.openPaywall).toHaveBeenCalledTimes(1);
  expect(mock.createLinkItem).not.toHaveBeenCalled();

  mock.entitled = true;
  view.rerender(<ShareScreen />);
  await waitFor(() => expect(mock.createLinkItem).toHaveBeenCalledTimes(1));
  expect(mock.createLinkItem.mock.calls[0][0]).toMatchObject({
    url: link.value,
  });
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));
  expect(mock.openPaywall).toHaveBeenCalledTimes(1);
});

it("gates a retry again when the entitlement lapses after a locked session ran", async () => {
  mock.createLinkItem.mockRejectedValue(new Error("save failed"));
  const view = render(<ShareScreen />);
  await waitFor(() => expect(mock.openPaywall).toHaveBeenCalledTimes(1));

  mock.entitled = true;
  view.rerender(<ShareScreen />);
  await waitFor(() =>
    expect(screen.getByText("capture.retryFailed")).toBeDefined(),
  );

  mock.entitled = false;
  view.rerender(<ShareScreen />);
  await settle();
  fireEvent.click(screen.getByText("capture.retryFailed"));
  await waitFor(() => expect(mock.openPaywall).toHaveBeenCalledTimes(2));
  expect(mock.createLinkItem).toHaveBeenCalledTimes(1);
});

/** Records the tombstone the real completion path writes for `link`. */
const seedGhostTombstone = () =>
  recordCompletedShare(
    {
      getString: (key) => mock.store.get(key),
      set: (key, value) => mock.store.set(key, value),
      remove: (key) => mock.store.delete(key),
      contains: (key) => mock.store.has(key),
    },
    fingerprintSharePayloads([
      { value: link.value, shareType: link.shareType, mimeType: link.mimeType },
    ]),
    mock.user._id,
  );

it("skips a replayed batch that matches the last completed one", async () => {
  // The Android task-restore ghost: no session record, but the payload is the
  // batch that already completed. It must not save again, and must not ask.
  mock.entitled = true;
  seedGhostTombstone();
  const view = render(<ShareScreen />);
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));
  // Resolution settling re-runs the reconcile effect; the skip runs once.
  mock.resolvedSharedPayloads = [resolvedLink];
  view.rerender(<ShareScreen />);
  await settle();
  expect(mock.createLinkItem).not.toHaveBeenCalled();
  expect(mock.clearSharedPayloads).toHaveBeenCalledTimes(1);
  expect(mock.router.replace).toHaveBeenCalledTimes(1);
  expect(
    vi
      .mocked(analytics.capture)
      .mock.calls.filter(([event]) => event === "share_ghost_skipped"),
  ).toHaveLength(1);
  // The tombstone survives, so the next replay is skipped too.
  expect(mock.store.has(LAST_COMPLETED_SHARE_KEY)).toBe(true);
});

it("keeps the tombstone when the native clear fails and the user cancels", async () => {
  // Every entry saved, the native clear throws, the user leaves via Cancel
  // (which deletes the completed session). The Android replay must still be
  // caught, or it saves the whole batch a second time.
  mock.entitled = true;
  mock.clearSharedPayloads.mockImplementationOnce(() => {
    throw new Error("clear failed");
  });
  const first = render(<ShareScreen />);
  await waitFor(() =>
    expect(screen.getByText("share.finishFailed")).toBeDefined(),
  );
  fireEvent.click(screen.getByText("common.cancel"));
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));
  first.unmount();

  vi.mocked(mock.router.replace).mockClear();
  render(<ShareScreen />);
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));
  expect(mock.createLinkItem).toHaveBeenCalledTimes(1);
});

it("never records a tombstone on iOS, which does not replay shares", async () => {
  mock.platform = "ios";
  mock.entitled = true;
  render(<ShareScreen />);
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));
  expect(mock.createLinkItem).toHaveBeenCalledTimes(1);
  expect(mock.store.has(LAST_COMPLETED_SHARE_KEY)).toBe(false);
});

it("records the discard when Cancel's native clear throws, so the leftover is not resumable", async () => {
  // A deferred share landed here (the flag +native-intent sets), the user is
  // not Pro and cancels at the gate, and the native clear throws. The batch
  // stays in the native store, so without the discard record the resume path
  // would route it straight back and re-save it.
  markPendingShareOnDevice();
  mock.clearSharedPayloads.mockImplementationOnce(() => {
    throw new Error("clear failed");
  });
  render(<ShareScreen />);
  await waitFor(() =>
    expect(screen.getByText("pro.unlockShelvr")).toBeDefined(),
  );
  fireEvent.click(screen.getByText("common.cancel"));
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));

  expect(mock.secure.get(DISCARDED_SHARE_KEY)).toBe(
    fingerprintSharePayloads([link]),
  );
  expect(hasPendingShareOnDevice()).toBe(false);
  expect(hasResumableSharedPayloads()).toBe(false);
});

it("clears the pending flag and the discard record once a share completes", async () => {
  mock.entitled = true;
  markPendingShareOnDevice();
  markShareDiscardedOnDevice(
    fingerprintSharePayloads([{ value: "https://old.test", shareType: "url" }]),
  );
  render(<ShareScreen />);
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));

  expect(mock.createLinkItem).toHaveBeenCalledTimes(1);
  expect(mock.secure.get(PENDING_SHARE_KEY)).toBe("");
  expect(mock.secure.get(DISCARDED_SHARE_KEY)).toBe("");
  expect(hasPendingShareOnDevice()).toBe(false);
});

it("still resumes and saves a different batch after a discard", async () => {
  mock.clearSharedPayloads.mockImplementationOnce(() => {
    throw new Error("clear failed");
  });
  const first = render(<ShareScreen />);
  await waitFor(() =>
    expect(screen.getByText("pro.unlockShelvr")).toBeDefined(),
  );
  fireEvent.click(screen.getByText("common.cancel"));
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));
  expect(hasResumableSharedPayloads()).toBe(false);
  first.unmount();

  // A new share replaced the leftover in the native store.
  const other: RawPayload = {
    value: "https://example.com/b",
    shareType: "url",
    mimeType: "text/plain",
  };
  mock.sharedPayloads = [other];
  expect(hasResumableSharedPayloads()).toBe(true);

  mock.entitled = true;
  mock.router.replace.mockClear();
  render(<ShareScreen />);
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));
  expect(mock.createLinkItem).toHaveBeenCalledTimes(1);
  expect(mock.createLinkItem.mock.calls[0][0]).toMatchObject({
    url: other.value,
  });
  expect(mock.secure.get(DISCARDED_SHARE_KEY)).toBe("");
});
