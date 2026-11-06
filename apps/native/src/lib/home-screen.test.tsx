// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HomeScreen from "@/app/(app)/(tabs)/(home)/index";
import type { Access } from "@/lib/access";
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

const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  entitlement: {} as Record<string, unknown>,
  access: { kind: "loading" } as Access,
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
  useQuery: () => ({ data: undefined, isError: false }),
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: { _id: USER } }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => mocks.entitlement,
  whenSheetSettled: () => Promise.resolve(),
}));
vi.mock("@/lib/free-plan", () => ({ useAccess: () => mocks.access }));
vi.mock("@/lib/trial-reminder", () => ({
  whenTrialPrimerDone: () => Promise.resolve(),
}));
vi.mock("@/lib/shared-lists", () => ({
  useMyFirstName: () => ({ firstName: null, loading: false, failed: false }),
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
  useFeedbackInvitation: () => ({
    invitationVisible: false,
    modalOpen: false,
    openFeedbackFromInvitation: vi.fn(),
    dismissInvitation: vi.fn(),
    closeFeedback: vi.fn(),
  }),
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
  passThrough: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  nameSheet: ({ visible }: { visible: boolean }) =>
    visible ? <div>name sheet</div> : null,
}));
vi.mock("@/components/home/pro-card", () => ({
  FreeSavesCard: fakes.nothing,
  ProCard: fakes.nothing,
}));
vi.mock("@/components/home/home-search", () => ({
  HomeSearch: fakes.passThrough,
}));
vi.mock("@/components/home/shared-lists-section", () => ({
  SharedListsSection: fakes.nothing,
}));
vi.mock("@/components/cancel-survey/cancel-survey-card", () => ({
  CancelSurveyCard: fakes.nothing,
}));
vi.mock("@/components/feedback/feedback-invitation", () => ({
  FeedbackInvitation: fakes.nothing,
}));
vi.mock("@/components/feedback/feedback-modal", () => ({
  FeedbackModal: fakes.nothing,
}));
vi.mock("@/components/home/home-places", () => ({
  HomePlaces: fakes.nothing,
  HomePlacesEmptyCard: fakes.nothing,
  UnplacedSaves: fakes.nothing,
}));
vi.mock("@/components/home/review-saves", () => ({
  ReviewSaves: fakes.nothing,
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: fakes.nothing,
}));
vi.mock("@/components/ui/header-scrim", () => ({ HeaderScrim: fakes.nothing }));
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
  ScrollView: fakes.passThrough,
  View: fakes.passThrough,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));

const notEntitled = { entitled: false, loading: false, status: "none" };
const trialing = {
  entitled: true,
  loading: false,
  status: "trialing",
  expiresAt: 7 * 86_400_000,
};

async function settle() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

function sheets() {
  return {
    letter: screen.queryByText("welcome letter") !== null,
    name: screen.queryByText("name sheet") !== null,
  };
}

beforeEach(() => {
  mocks.store.clear();
  mocks.entitlement = notEntitled;
  mocks.access = { kind: "loading" };
  welcomeSave.mark(USER);
  welcomeName.mark(USER);
});

afterEach(cleanup);

it("waits for a purchase made before sign-in, then shows the letter before asking for a name", async () => {
  mocks.access = { kind: "pro", syncing: true };
  const { rerender } = render(<HomeScreen />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: false });

  mocks.entitlement = trialing;
  mocks.access = { kind: "pro", syncing: false };
  rerender(<HomeScreen />);
  await settle();
  expect(sheets()).toEqual({ letter: true, name: false });

  act(() => welcomeSave.finish(USER));
  await settle();
  expect(sheets()).toEqual({ letter: false, name: true });
});

it("asks a free account for a name", async () => {
  mocks.access = FREE;
  render(<HomeScreen />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: true });
});

it("asks for a name once the purchase window passes with no purchase", async () => {
  mocks.access = { kind: "pro", syncing: true };
  const { rerender } = render(<HomeScreen />);
  await settle();
  expect(sheets().name).toBe(false);

  mocks.access = FREE;
  rerender(<HomeScreen />);
  await settle();
  expect(sheets()).toEqual({ letter: false, name: true });
});
