// @vitest-environment jsdom
import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HomeScreen from "@/app/(app)/(tabs)/(home)/index";
import type { Access } from "@/lib/access";
import { analytics } from "@/lib/analytics";
import { useFeedbackInvitation } from "@/lib/feedback-invitation";
import { useReviewPrompt } from "@/lib/review-prompt";
import {
  trialReminderPrimer,
  useTrialReminder,
  useTrialReminderPrimerOpen,
} from "@/lib/trial-reminder";
import { welcomeName, welcomeSave } from "@/lib/welcome-save";

const USER = "user_a";
const FREE: Access = {
  kind: "free",
  limit: 10,
  used: 0,
  left: 10,
  pending: 0,
  open: true,
};
const GRANTED = { granted: true, canAskAgain: true, ios: { status: 2 } };
const UNDETERMINED = { granted: false, canAskAgain: true, ios: { status: 0 } };

const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  entitlement: {} as Record<string, unknown>,
  access: { kind: "loading" } as Access,
  permission: {} as Record<string, unknown>,
  permissionGate: null as Promise<void> | null,
  firstName: {} as {
    firstName: string | null | undefined;
    failed: boolean;
    error?: unknown;
  },
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mocks.store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    mocks.store.set(key, value);
  },
}));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  setNotificationChannelAsync: vi.fn(),
  getPermissionsAsync: () =>
    (mocks.permissionGate ?? Promise.resolve()).then(() => mocks.permission),
  requestPermissionsAsync: () => Promise.resolve(mocks.permission),
  scheduleNotificationAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
  dismissNotificationAsync: vi.fn(),
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useIsFocused: () => true,
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => effect(), [effect]);
    },
  };
});
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { remindersEnabled: false }, isError: false }),
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: { _id: USER } }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => mocks.entitlement,
  waitForSheetTransition: () => Promise.resolve(),
  whenSheetSettled: () => Promise.resolve(),
}));
vi.mock("@/lib/free-plan", () => ({ useAccess: () => mocks.access }));
vi.mock("@/lib/shared-lists", () => ({
  useMyFirstName: () => mocks.firstName,
}));
vi.mock("@/lib/home-feed", () => ({
  useHomeFeed: () => ({
    items: [],
    canLoadMore: false,
    loadingMore: false,
    loadMore: vi.fn(),
  }),
}));
vi.mock("@/lib/home-places", () => ({ unplacedSaves: () => [] }));
vi.mock("@/lib/feedback-invitation", () => ({
  useBusySaving: () => false,
  useFeedbackInvitation: vi.fn(() => ({
    invitationVisible: false,
    modalOpen: false,
    openFeedbackFromInvitation: vi.fn(),
    dismissInvitation: vi.fn(),
    closeFeedback: vi.fn(),
  })),
}));
vi.mock("@/lib/use-cancel-survey", () => ({
  useCancelSurvey: () => ({
    visible: false,
    presented: vi.fn(),
    finish: vi.fn(),
  }),
}));
vi.mock("@/lib/review-prompt", () => ({ useReviewPrompt: vi.fn() }));

const fakes = vi.hoisted(() => ({
  nothing: () => null,
  invitation: ({ onSendFeedback }: { onSendFeedback: () => void }) => (
    <button type="button" onClick={onSendFeedback}>
      feedback invitation
    </button>
  ),
  passThrough: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  nameSheet: ({
    visible,
    onCancel,
  }: {
    visible: boolean;
    onCancel: () => void;
  }) =>
    visible ? (
      <button type="button" onClick={onCancel}>
        name sheet
      </button>
    ) : null,
  libraryRows: () => <div>library rows</div>,
  search: ({ top, children }: { top?: ReactNode; children?: ReactNode }) => (
    <div>
      {top}
      {children}
    </div>
  ),
}));
vi.mock("@/components/home/pro-card", () => ({
  FreeSavesCard: fakes.nothing,
  ProCard: fakes.nothing,
}));
vi.mock("@/components/home/home-search", () => ({
  HomeSearch: fakes.search,
}));
vi.mock("@/components/home/shared-lists-section", () => ({
  SharedListsSection: fakes.nothing,
}));
vi.mock("@/components/cancel-survey/cancel-survey-card", () => ({
  CancelSurveyCard: fakes.nothing,
}));
vi.mock("@/components/feedback/feedback-invitation", () => ({
  FeedbackInvitation: fakes.invitation,
}));
vi.mock("@/components/feedback/feedback-modal", () => ({
  FeedbackModal: fakes.nothing,
}));
vi.mock("@/components/home/home-places", () => ({
  HomePlaces: fakes.nothing,
  HomePlacesEmptyCard: fakes.nothing,
}));
vi.mock("@/components/home/library-rows", () => ({
  LibraryRows: fakes.libraryRows,
}));
vi.mock("@/components/home/home-header", () => ({
  HomeHeader: fakes.nothing,
}));
vi.mock("@/components/home/recent-saves", () => ({
  RecentSaves: fakes.nothing,
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: fakes.nothing,
}));
vi.mock("expo-router/js-tabs", () => ({ useBottomTabBarHeight: () => 0 }));
vi.mock("@/components/shared-list/name-sheet", () => ({
  NameSheet: fakes.nameSheet,
}));
vi.mock("@/components/home/welcome-save-sheet", async () => {
  const { useWelcomeSheetVisible } = await import("@/lib/welcome-save");
  function WelcomeSaveSheet({
    userId,
    ready,
  }: {
    userId: string;
    ready: boolean;
  }) {
    return useWelcomeSheetVisible(userId, ready) ? (
      <div>welcome letter</div>
    ) : null;
  }
  return { WelcomeSaveSheet };
});
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  ScrollView: fakes.passThrough,
  View: fakes.passThrough,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { gap: (n: number) => n * 8 } }),
}));

const notEntitled = { entitled: false, loading: false, status: "none" };
const trialing = {
  entitled: true,
  loading: false,
  status: "trialing",
  expiresAt: Date.now() + 7 * 86_400_000,
};

function App() {
  useTrialReminder();
  const primerOpen = useTrialReminderPrimerOpen();
  return (
    <>
      <HomeScreen />
      {primerOpen ? <div>trial primer</div> : null}
    </>
  );
}

async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}

function sheets() {
  return {
    letter: screen.queryByText("welcome letter") !== null,
    name: screen.queryByText("name sheet") !== null,
    primer: screen.queryByText("trial primer") !== null,
  };
}

function deferred() {
  return {
    feedback: vi.mocked(useFeedbackInvitation).mock.lastCall?.[1]?.defer,
    review: vi.mocked(useReviewPrompt).mock.lastCall?.[1]?.defer,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.clear();
  mocks.entitlement = notEntitled;
  mocks.access = { kind: "loading" };
  mocks.permission = GRANTED;
  mocks.permissionGate = null;
  mocks.firstName = { firstName: null, failed: false };
  welcomeSave.mark(USER);
  welcomeName.mark(USER);
});

afterEach(async () => {
  cleanup();
  trialReminderPrimer.dismiss();
  await settle();
});

it("waits for a purchase made before sign-in, then shows the letter before asking for a name", async () => {
  mocks.access = { kind: "pro", syncing: true };
  const { rerender } = render(<App />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: false, primer: false });

  mocks.entitlement = trialing;
  mocks.access = { kind: "pro", syncing: false };
  rerender(<App />);
  await settle();
  expect(sheets()).toEqual({ letter: true, name: false, primer: false });

  act(() => welcomeSave.finish(USER));
  await settle();
  expect(sheets()).toEqual({ letter: false, name: true, primer: false });
});

it("asks a free account for a name", async () => {
  mocks.access = FREE;
  render(<App />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: true, primer: false });
});

it("asks for a name once the purchase window passes with no purchase", async () => {
  mocks.access = { kind: "pro", syncing: true };
  const { rerender } = render(<App />);
  await settle();
  expect(sheets().name).toBe(false);

  mocks.access = FREE;
  rerender(<App />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: true, primer: false });
});

it("keeps a purchase that lands while the name sheet is up waiting until it closes, then shows the primer and the letter one at a time", async () => {
  mocks.permission = UNDETERMINED;
  mocks.access = FREE;
  const { rerender } = render(<App />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: true, primer: false });

  mocks.entitlement = trialing;
  mocks.access = { kind: "pro", syncing: false };
  rerender(<App />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: true, primer: false });

  fireEvent.click(screen.getByText("name sheet"));
  await settle();
  expect(sheets()).toEqual({ letter: false, name: false, primer: true });

  act(() => trialReminderPrimer.answer(false));
  await settle();
  expect(sheets()).toEqual({ letter: true, name: false, primer: false });
});

it("lets the feedback invitation and the review prompt run while a free account's letter waits for Pro", async () => {
  welcomeName.finish(USER);
  mocks.access = FREE;
  render(<App />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: false, primer: false });
  expect(welcomeSave.isPending(USER)).toBe(true);
  expect(deferred()).toEqual({ feedback: false, review: false });
});

it("holds the feedback invitation and the review prompt while a new account's name ask waits for the purchase window", async () => {
  mocks.access = { kind: "pro", syncing: true };
  const { rerender } = render(<App />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: false, primer: false });
  expect(deferred()).toEqual({ feedback: true, review: true });

  mocks.access = FREE;
  rerender(<App />);
  await settle();
  expect(sheets().name).toBe(true);

  fireEvent.click(screen.getByText("name sheet"));
  await settle();
  expect(deferred()).toEqual({ feedback: false, review: false });
});

it("reports a failed name lookup when it spends the ask", async () => {
  const lookup = new Error("offline");
  mocks.firstName = { firstName: undefined, failed: true, error: lookup };
  mocks.access = FREE;
  render(<App />);
  await settle();
  expect(sheets().name).toBe(false);
  expect(welcomeName.isPending(USER)).toBe(false);
  expect(analytics.captureError).toHaveBeenCalledWith(
    "welcome_name_lookup_failed",
    lookup,
  );
});

it("shows the trial primer, the letter and the name sheet one at a time when a purchase lands after Home has opened", async () => {
  mocks.permission = UNDETERMINED;
  mocks.access = { kind: "pro", syncing: true };
  const { rerender } = render(<App />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: false, primer: false });

  mocks.entitlement = trialing;
  mocks.access = { kind: "pro", syncing: false };
  rerender(<App />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: false, primer: true });

  act(() => trialReminderPrimer.answer(false));
  await settle();
  expect(sheets()).toEqual({ letter: true, name: false, primer: false });

  act(() => welcomeSave.finish(USER));
  await settle();
  expect(sheets()).toEqual({ letter: false, name: true, primer: false });
});

it("hides the feedback invitation while the trial primer holds its turn but has not opened yet", async () => {
  welcomeName.finish(USER);
  let openGate = () => {};
  mocks.permissionGate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  mocks.permission = UNDETERMINED;
  mocks.access = { kind: "pro", syncing: true };
  vi.mocked(useFeedbackInvitation).mockReturnValue({
    invitationVisible: true,
    modalOpen: false,
    openFeedbackFromInvitation: vi.fn(),
    dismissInvitation: vi.fn(),
    closeFeedback: vi.fn(),
  });
  const { rerender } = render(<App />);
  await settle();
  expect(screen.queryByText("feedback invitation")).not.toBeNull();

  mocks.entitlement = trialing;
  mocks.access = { kind: "pro", syncing: false };
  rerender(<App />);
  await settle();
  expect(sheets().primer).toBe(false);
  expect(screen.queryByText("feedback invitation")).toBeNull();

  openGate();
  await settle();
  expect(sheets().primer).toBe(true);
});

it("shows the library rows on a Home with no saves", async () => {
  mocks.access = FREE;
  render(<HomeScreen />);
  await settle();
  expect(screen.getByText("library rows")).toBeTruthy();
});
