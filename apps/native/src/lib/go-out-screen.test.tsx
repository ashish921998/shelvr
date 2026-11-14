// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import GoOutScreen from "@/app/(app)/go-out";

type PickerProps = {
  places: { name: string }[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onBack: () => void;
};

const mocks = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  gated: false,
  replace: vi.fn(),
  back: vi.fn(),
  refetch: vi.fn(),
  queries: [] as unknown[],
  personal: {} as Record<string, unknown>,
  shared: {} as Record<string, unknown>,
  picker: undefined as PickerProps | undefined,
}));

vi.mock("@/lib/i18n", () => ({ useAppLocale: () => "en" }));
vi.mock("@/lib/trip-planner", () => ({
  sameCity: (a: string, b: string) => a === b,
}));
vi.mock("@/lib/plan-gate", () => ({
  usePlanGate: () => ({ gated: mocks.gated }),
}));
vi.mock("@/lib/use-report-load-failure", () => ({
  useReportLoadFailure: vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    mapPlaces: { listMapPlaces: "listMapPlaces" },
    sharedLists: { getSharedList: "getSharedList" },
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (fn: string, args: unknown) => ({ fn, args }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { fn: string; args: unknown }) => {
    mocks.queries.push(options);
    return options.fn === "listMapPlaces" ? mocks.personal : mocks.shared;
  },
}));
vi.mock("expo-router", () => ({
  Redirect: vi.fn(({ href }: { href: string }) => (
    <span>{`redirect ${href}`}</span>
  )),
  useLocalSearchParams: () => mocks.params,
  useRouter: () => ({ replace: mocks.replace, back: mocks.back }),
}));
vi.mock("@/components/go-out-hub", () => ({
  GoOutHub: vi.fn(
    ({
      onPlan,
      onPickSpot,
    }: {
      onPlan: (kind: "date" | "trip") => void;
      onPickSpot: () => void;
    }) => (
      <div>
        <button onClick={() => onPlan("date")}>date</button>
        <button onClick={() => onPlan("trip")}>trip</button>
        <button onClick={onPickSpot}>pick</button>
      </div>
    ),
  ),
}));
vi.mock("@/components/go-out-picker", () => ({
  GoOutPicker: vi.fn((props: PickerProps) => {
    mocks.picker = props;
    return (
      <div>
        {props.places.map((place) => (
          <span key={place.name}>{place.name}</span>
        ))}
        <button onClick={props.onRetry}>retry</button>
        <button onClick={props.onBack}>back</button>
      </div>
    );
  }),
}));

const loaded = (data: unknown) => ({
  data,
  isPending: false,
  isError: false,
  refetch: mocks.refetch,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { city: "Austin" };
  mocks.gated = false;
  mocks.queries = [];
  mocks.picker = undefined;
  mocks.personal = loaded([
    { name: "Franklin Barbecue", lat: 30.27, lng: -97.73, city: "Austin" },
    { name: "Le Bernardin", lat: 40.76, lng: -73.98, city: "New York" },
  ]);
  mocks.shared = loaded({
    places: [
      { name: "Small Victory", lat: 30.26, lng: -97.74, city: "Austin" },
    ],
  });
});

const pick = () =>
  fireEvent.click(screen.getByRole("button", { name: "pick" }));

it("picks from the city's own saves and goes back to the hub", () => {
  render(<GoOutScreen />);
  pick();
  expect(screen.getByText("Franklin Barbecue")).toBeTruthy();
  expect(screen.queryByText("Le Bernardin")).toBeNull();
  expect(mocks.queries).toContainEqual({ fn: "getSharedList", args: "skip" });
  fireEvent.click(screen.getByRole("button", { name: "back" }));
  expect(screen.getByRole("button", { name: "pick" })).toBeTruthy();
});

it("picks from a shared list's places when opened from one", () => {
  mocks.params = { city: "Austin", listId: "list1" };
  render(<GoOutScreen />);
  pick();
  expect(screen.getByText("Small Victory")).toBeTruthy();
  expect(screen.queryByText("Franklin Barbecue")).toBeNull();
  expect(mocks.queries).toContainEqual({ fn: "listMapPlaces", args: "skip" });
});

it("passes a failed load to the picker and retries it", () => {
  mocks.personal = { ...loaded(undefined), isError: true };
  render(<GoOutScreen />);
  pick();
  expect(mocks.picker?.failed).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  expect(mocks.refetch).toHaveBeenCalledTimes(1);
});

it("opens Plan a date or Plan a trip for the city", () => {
  mocks.params = { city: "Austin", listId: "list1" };
  render(<GoOutScreen />);
  fireEvent.click(screen.getByRole("button", { name: "date" }));
  expect(mocks.replace).toHaveBeenCalledWith({
    pathname: "/date-plan",
    params: { city: "Austin", listId: "list1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "trip" }));
  expect(mocks.replace).toHaveBeenLastCalledWith({
    pathname: "/new-trip",
    params: { city: "Austin", listId: "list1" },
  });
});

it("sends a locked account without a list to the plan gate", () => {
  mocks.gated = true;
  render(<GoOutScreen />);
  expect(screen.getByText("redirect /plan-gate")).toBeTruthy();
  expect(mocks.queries).toContainEqual({ fn: "listMapPlaces", args: "skip" });
});
