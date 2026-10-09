// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { aiConsentRequiredError } from "@convex/model/aiConsent";
import { useFindLinks } from "./use-find-links";

type AlertButton = { text: string; onPress?: () => void };
const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  alert: vi.fn(),
  push: vi.fn(),
}));
vi.mock("convex/react", () => ({ useMutation: () => mocks.search }));
vi.mock("@convex/_generated/api", () => ({ api: { items: {} } }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("./entitlement", () => ({
  usePaywallGuard: () => ({ guard: async () => true, loading: false }),
}));

const item = { _id: "item_1", status: "ready" } as never;

beforeEach(() => vi.clearAllMocks());

it("points a user who turned AI off at Settings", async () => {
  mocks.search.mockRejectedValue(aiConsentRequiredError());
  const { result } = renderHook(() => useFindLinks(item));
  await act(() => result.current.findLinks());

  expect(mocks.alert).toHaveBeenCalledTimes(1);
  const [, message, buttons] = mocks.alert.mock.calls[0] as [
    string,
    string,
    AlertButton[],
  ];
  expect(message).toBe("aiConsent.findLinksOff");
  buttons.find((button) => button.text === "profile.settings")?.onPress?.();
  expect(mocks.push).toHaveBeenCalledWith("/settings");
});

it("keeps the retry message for any other failure", async () => {
  mocks.search.mockRejectedValue(new Error("Server Error"));
  const { result } = renderHook(() => useFindLinks(item));
  await act(() => result.current.findLinks());
  expect(mocks.alert).toHaveBeenCalledWith(
    "errors.searchTitle",
    "errors.retrySoon",
  );
  expect(mocks.push).not.toHaveBeenCalled();
});
