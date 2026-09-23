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
import {
  fingerprintSharePayloads,
  GHOST_SUPPRESS_MS,
  LAST_COMPLETED_SHARE_KEY,
} from "@/lib/share/storage";

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
  uuid: 0,
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
  localizeError: (message: string) => message,
}));
vi.mock("@/lib/first-share", () => ({ recordShareSaved: vi.fn() }));
vi.mock("@/lib/share/pending-share-store", () => ({
  clearPendingShareOnDevice: vi.fn(),
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
  mock.uuid = 0;
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

const ghostTombstone = (extra: object = {}) =>
  JSON.stringify({
    fingerprint: fingerprintSharePayloads([
      {
        value: link.value,
        shareType: link.shareType,
        mimeType: link.mimeType,
      },
    ]),
    userId: mock.user._id,
    ...extra,
  });

it("asks before re-saving a batch that matches the last completed one", async () => {
  // The Android task-restore ghost: no session record, but the payload is the
  // batch that just completed. It must prompt, not auto-save a duplicate.
  mock.entitled = true;
  mock.store.set(LAST_COMPLETED_SHARE_KEY, ghostTombstone());
  render(<ShareScreen />);
  await waitFor(() =>
    expect(screen.getByText("share.ghostTitle")).toBeDefined(),
  );
  await settle();
  expect(mock.createLinkItem).not.toHaveBeenCalled();
  expect(mock.router.replace).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText("share.saveAgain"));
  await waitFor(() => expect(mock.createLinkItem).toHaveBeenCalledTimes(1));
  expect(mock.createLinkItem.mock.calls[0][0]).toMatchObject({
    url: link.value,
  });
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));
});

it("dismisses the ghost prompt and latches the suppression", async () => {
  mock.entitled = true;
  mock.store.set(LAST_COMPLETED_SHARE_KEY, ghostTombstone());
  render(<ShareScreen />);
  await waitFor(() =>
    expect(screen.getByText("share.ghostTitle")).toBeDefined(),
  );

  fireEvent.click(screen.getByText("common.cancel"));
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));
  expect(mock.createLinkItem).not.toHaveBeenCalled();
  expect(mock.clearSharedPayloads).toHaveBeenCalled();
  const tombstone = JSON.parse(
    mock.store.get(LAST_COMPLETED_SHARE_KEY) as string,
  );
  expect(tombstone.dismissedAt).toBeGreaterThan(0);
  expect(tombstone.userId).toBe(mock.user._id);
});

it("silently clears a recently dismissed ghost without prompting", async () => {
  mock.entitled = true;
  mock.store.set(
    LAST_COMPLETED_SHARE_KEY,
    ghostTombstone({ dismissedAt: Date.now() - GHOST_SUPPRESS_MS / 2 }),
  );
  render(<ShareScreen />);
  await settle();
  expect(screen.queryByText("share.ghostTitle")).toBeNull();
  await waitFor(() => expect(mock.router.replace).toHaveBeenCalledWith("/"));
  expect(mock.clearSharedPayloads).toHaveBeenCalled();
  expect(mock.createLinkItem).not.toHaveBeenCalled();
});
