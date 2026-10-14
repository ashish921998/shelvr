import { beforeEach, expect, it, vi } from "vitest";
import { manageSubscription } from "./manage-subscription";

const mock = vi.hoisted(() => ({
  order: [] as string[],
  present: vi.fn(),
  alert: vi.fn(),
  openURL: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/entitlement", () => ({
  waitForSheetTransition: async () => {
    mock.order.push("settled");
  },
  presentCustomerCenter: mock.present,
}));
vi.mock("react-native", () => ({
  Alert: { alert: mock.alert },
  Linking: { openURL: mock.openURL },
  Platform: { OS: "ios" },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.order.length = 0;
  mock.present.mockImplementation(async () => {
    mock.order.push("customer-center");
    return true;
  });
});

it("presents Customer Center only after the sheets are gone", async () => {
  await manageSubscription(() => mock.order.push("dismissed"));
  expect(mock.order).toEqual(["dismissed", "settled", "customer-center"]);
  expect(mock.alert).not.toHaveBeenCalled();
});

it("points to the App Store when Customer Center cannot present", async () => {
  mock.present.mockResolvedValue(false);
  await manageSubscription(() => {});

  const buttons = mock.alert.mock.calls[0][2] as {
    text: string;
    onPress?: () => void;
  }[];
  buttons.find((button) => button.text === "pro.openStore")?.onPress?.();
  expect(mock.openURL).toHaveBeenCalledWith(
    "https://apps.apple.com/account/subscriptions",
  );
});
