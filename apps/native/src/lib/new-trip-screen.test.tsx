// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewTripScreen from "@/app/(app)/new-trip";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  guard: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useAppLocale: () => "en",
  formattingLocale: () => "en-US",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/haptics", () => ({ haptics: { success: vi.fn() } }));
vi.mock("@/lib/appearance", () => ({ isDarkThemeName: () => false }));
vi.mock("@/lib/plan-gate", () => ({ usePlanGate: () => ({ gated: false }) }));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: () => ({ guard: mocks.guard }),
}));
vi.mock("@/lib/create-trip-plan", () => ({ useCreateTripPlan: vi.fn() }));
vi.mock("@/lib/trip-edit", () => ({ usePlaceSearch: vi.fn() }));
vi.mock("@/lib/screen-dismiss", () => ({ backOrHome: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("convex/react", () => ({
  useMutation: () => mocks.create,
  useAction: () => vi.fn(),
}));
vi.mock("expo-router", () => ({
  Redirect: vi.fn(({ href }: { href: string }) => (
    <span>{`redirect ${href}`}</span>
  )),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: mocks.replace, setParams: vi.fn() }),
  useNavigation: () => ({ isFocused: () => true }),
}));
vi.mock("@expo/ui/community/datetime-picker", () => ({
  DateTimePicker: vi.fn(
    ({
      onValueChange,
    }: {
      onValueChange: (event: unknown, date: Date) => void;
    }) => (
      <input
        aria-label="date"
        onChange={(event) => onValueChange(null, new Date(event.target.value))}
      />
    ),
  ),
}));
vi.mock("expo-maps", () => ({ AppleMaps: {}, GoogleMaps: {} }));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: {},
  SaveFormat: {},
}));
vi.mock("@/components/add-place-sheet", () => ({
  AddPlaceSearch: vi.fn(() => null),
}));
vi.mock("@/components/trip-planner/trip-planner-reveal", () => ({
  TripPlannerReveal: vi.fn(() => null),
}));
vi.mock("@/components/trip-planner/start-date", () => ({
  StartDate: vi.fn(() => null),
}));
vi.mock("@/components/trip-planner/trip-country-picker", () => ({
  TripCountryPicker: vi.fn(
    ({
      countries,
      onChange,
    }: {
      countries: string[];
      onChange: (countries: string[]) => void;
    }) => (
      <>
        {["PT", "ES"].map((code) => (
          <button key={code} onClick={() => onChange([...countries, code])}>
            {`country ${code}`}
          </button>
        ))}
      </>
    ),
  ),
}));
vi.mock("@/components/trip-planner/trip-planner-form", () => ({
  FormSection: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  CityPicker: vi.fn(() => null),
  DaysStepper: vi.fn(() => null),
  InterestChips: vi.fn(() => null),
  PaceChips: vi.fn(() => null),
  StayField: vi.fn(() => null),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({
      title,
      onPress,
      disabled,
    }: {
      title: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <button disabled={disabled} onClick={onPress}>
        {title}
      </button>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
    hairlineWidth: 1,
  },
  useUnistyles: () => ({ theme: { colors: {} }, rt: { themeName: "light" } }),
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
  Platform: { OS: "ios" },
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) => (
      <button
        aria-label={accessibilityLabel}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
  TextInput: vi.fn(
    ({
      testID,
      value,
      onChangeText,
    }: {
      testID: string;
      value: string;
      onChangeText: (text: string) => void;
    }) => (
      <input
        data-testid={testID}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  ),
}));

const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 10, 12));
  mocks.guard.mockResolvedValue(true);
  mocks.create.mockResolvedValue("trip-9");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Plan a trip from scratch", () => {
  it("creates the trip with the chosen countries and dates", async () => {
    render(<NewTripScreen />);
    const start = screen.getByRole("button", { name: "tripSetup.start" });
    expect((start as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId("trip-setup-name"), {
      target: { value: "Iberia" },
    });
    press("tripSetup.chooseCountries");
    press("country PT");
    press("country ES");
    press("common.done");

    const [startDate, endDate] = screen.getAllByLabelText("date");
    fireEvent.change(startDate!, { target: { value: "2026-11-20T12:00" } });
    fireEvent.change(endDate!, { target: { value: "2026-11-23T12:00" } });
    press("tripSetup.start");
    press("tripSetup.decideLater");

    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenCalledWith({
      name: "Iberia",
      countries: ["PT", "ES"],
      city: "",
      dayCount: 4,
      startDate: "2026-11-20",
    });
    expect(mocks.replace).toHaveBeenCalledWith({
      pathname: "/trip-plan/[id]",
      params: { id: "trip-9" },
    });
  });

  it("sends a day count and no date when the trip has no dates", async () => {
    render(<NewTripScreen />);
    fireEvent.change(screen.getByTestId("trip-setup-name"), {
      target: { value: "Someday" },
    });
    press("tripSetup.chooseCountries");
    press("country PT");
    press("common.done");
    press("tripSetup.useDays");
    press("tripSetup.start");
    press("tripSetup.decideLater");

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenCalledWith({
      name: "Someday",
      countries: ["PT"],
      city: "",
      dayCount: 5,
    });
  });

  it("creates nothing when the paywall is dismissed", async () => {
    mocks.guard.mockResolvedValue(false);
    render(<NewTripScreen />);
    fireEvent.change(screen.getByTestId("trip-setup-name"), {
      target: { value: "Iberia" },
    });
    press("tripSetup.chooseCountries");
    press("country PT");
    press("common.done");
    press("tripSetup.start");
    press("tripSetup.decideLater");

    await waitFor(() => expect(mocks.guard).toHaveBeenCalled());
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
