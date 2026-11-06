// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BeenCitiesScreen from "@/app/(app)/been-cities";

type Snapshot = { data: string[] | undefined; error: Error | null };
type Change = { add?: string[]; remove?: string[] };
type LocalStore = {
  getQuery: () => string[] | undefined;
  setQuery: (fn: unknown, args: unknown, value: string[]) => void;
};

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const query = {
    snapshot: { data: undefined, error: null } as Snapshot,
    set(next: Partial<Snapshot>) {
      query.snapshot = { ...query.snapshot, ...next };
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    query,
    send: vi.fn<(change: Change) => Promise<null>>(),
    router: { push: vi.fn(), back: vi.fn(), canGoBack: () => true },
    backOrHome: vi.fn(),
    capture: vi.fn(),
    captureError: vi.fn(),
    alert: vi.fn(),
    options: vi.fn(),
  };
});

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/screen-dismiss", () => ({ backOrHome: mocks.backOrHome }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () =>
    useSyncExternalStore(mocks.query.subscribe, () => mocks.query.snapshot),
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("convex/react", () => {
  const mutation = {
    withOptimisticUpdate:
      (update: (store: LocalStore, change: Change) => void) =>
      (change: Change) => {
        const before = mocks.query.snapshot.data;
        update(
          {
            getQuery: () => mocks.query.snapshot.data,
            setQuery: (_fn, _args, value) => mocks.query.set({ data: value }),
          },
          change,
        );
        return mocks.send(change).catch((error: unknown) => {
          mocks.query.set({ data: before });
          throw error;
        });
      },
  };
  return {
    useConvexAuth: () => ({ isAuthenticated: true }),
    useMutation: () => mutation,
  };
});
vi.mock("expo-router", () => ({
  useRouter: () => mocks.router,
  Stack: {
    Screen: vi.fn(({ options }: { options: object }) => {
      mocks.options(options);
      return null;
    }),
    Toolbar: Object.assign(
      vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
      {
        Button: vi.fn(
          ({
            children,
            onPress,
          }: {
            children: ReactNode;
            onPress: () => void;
          }) => <button onClick={onPress}>{children}</button>,
        ),
      },
    ),
  },
}));
vi.mock("@/components/been/been-city-grid", () => ({
  BeenCityGrid: vi.fn(
    ({
      picked,
      onToggle,
    }: {
      picked: string[];
      onToggle: (city: string) => void;
    }) => (
      <div>
        {["lisbon", "madrid"].map((id) => (
          <button
            key={id}
            role="checkbox"
            aria-checked={picked.includes(id)}
            aria-label={id}
            onClick={() => onToggle(id)}
          />
        ))}
      </div>
    ),
  ),
}));
vi.mock("@/components/empty-state", () => ({
  EmptyState: vi.fn(
    ({ title, message }: { title: string; message: string }) => (
      <div>
        <span>{title}</span>
        <span>{message}</span>
      </div>
    ),
  ),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <span>loader</span>),
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({
    theme: { type: { title: {} }, colors: { foreground: "ink" } },
  }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  Platform: { OS: "ios" },
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  )),
}));

const ticked = (city: string) =>
  screen.getByRole("checkbox", { name: city }).getAttribute("aria-checked");
const settle = () => act(async () => {});

beforeEach(() => {
  mocks.query.snapshot = { data: undefined, error: null };
  mocks.send.mockReset();
  mocks.backOrHome.mockClear();
  mocks.capture.mockClear();
  mocks.captureError.mockClear();
  mocks.alert.mockClear();
  mocks.options.mockClear();
});
afterEach(cleanup);

describe("the Been cities editor", () => {
  it("shows a loader, then the error state", () => {
    render(<BeenCitiesScreen />);
    expect(screen.getByText("loader")).toBeTruthy();
    expect(mocks.options).toHaveBeenCalledWith(
      expect.objectContaining({ title: "been.citiesTitle" }),
    );
    act(() => mocks.query.set({ error: new Error("down") }));
    expect(screen.getByText("errors.unexpectedTitle")).toBeTruthy();
    expect(screen.getByText("errors.retrySoon")).toBeTruthy();
    expect(screen.queryByText("loader")).toBeNull();
  });

  it("ticks the account's cities under the editor line", () => {
    mocks.query.snapshot = { data: ["madrid"], error: null };
    render(<BeenCitiesScreen />);
    expect(screen.getByText("been.editorBody")).toBeTruthy();
    expect(ticked("madrid")).toBe("true");
    expect(ticked("lisbon")).toBe("false");
  });

  it("saves each tap at once and reports the count after it", async () => {
    mocks.query.snapshot = { data: ["madrid"], error: null };
    mocks.send.mockResolvedValue(null);
    render(<BeenCitiesScreen />);
    fireEvent.click(screen.getByRole("checkbox", { name: "lisbon" }));
    expect(mocks.send).toHaveBeenLastCalledWith({ add: ["lisbon"] });
    expect(ticked("lisbon")).toBe("true");
    await settle();
    expect(mocks.capture).toHaveBeenLastCalledWith("been_city_changed", {
      been: true,
      count: 2,
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "madrid" }));
    expect(mocks.send).toHaveBeenLastCalledWith({ remove: ["madrid"] });
    expect(ticked("madrid")).toBe("false");
    await settle();
    expect(mocks.capture).toHaveBeenLastCalledWith("been_city_changed", {
      been: false,
      count: 1,
    });
    expect(mocks.query.snapshot.data).toEqual(["lisbon"]);
  });

  it("takes a failed save back and says so", async () => {
    const error = new Error("rate limited");
    mocks.query.snapshot = { data: ["madrid"], error: null };
    mocks.send.mockRejectedValue(error);
    render(<BeenCitiesScreen />);
    fireEvent.click(screen.getByRole("checkbox", { name: "lisbon" }));
    expect(ticked("lisbon")).toBe("true");
    await settle();
    expect(ticked("lisbon")).toBe("false");
    expect(mocks.alert).toHaveBeenCalledWith(
      "been.saveFailed",
      "errors.connection",
    );
    expect(mocks.captureError).toHaveBeenCalledWith(
      "been_city_update_failed",
      error,
    );
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("closes through backOrHome", () => {
    mocks.query.snapshot = { data: [], error: null };
    render(<BeenCitiesScreen />);
    fireEvent.click(screen.getByText("common.close"));
    expect(mocks.backOrHome).toHaveBeenCalledWith(mocks.router);
  });
});
