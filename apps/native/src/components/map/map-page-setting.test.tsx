// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MapPageSetting } from "./map-page-setting";

type Action = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  testID?: string;
};

const mocks = vi.hoisted(() => ({
  query: { data: undefined, isPending: true } as {
    data?: { token: string; cities: string[]; blocked: boolean } | null;
    isPending: boolean;
    isError?: boolean;
  },
  push: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: { count?: number }) =>
    params?.count === undefined ? key : `${key}:${params.count}`,
}));
vi.mock("@convex/_generated/api", () => ({
  api: { publicMaps: { getMyPublicMap: "getMyPublicMap" } },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (ref: string) => ({ ref }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/ui/setting-card", () => ({
  SettingCard: vi.fn(
    ({
      title,
      description,
      action,
    }: {
      title: string;
      description?: string;
      action: Action;
    }) => (
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        <button
          type="button"
          data-testid={action.testID}
          data-busy={action.busy ? "true" : "false"}
          onClick={action.onPress}
        >
          {action.label}
        </button>
      </div>
    ),
  ),
}));

const TOKEN = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

function card() {
  render(<MapPageSetting />);
  const button = screen.getByTestId("map-page-setting");
  return {
    description: screen.getByRole("paragraph").textContent,
    label: button.textContent,
    busy: button.dataset.busy,
    button,
  };
}

it("waits on the page before offering Set up", () => {
  mocks.query = { data: undefined, isPending: true };
  expect(card()).toMatchObject({
    description: "publicMap.settingOff",
    label: "publicMap.setUp",
    busy: "true",
  });
  expect(screen.getByText("publicMap.settingTitle")).toBeTruthy();
});

it("offers Set up without a page, after an error, and for a blocked page", () => {
  for (const query of [
    { data: null, isPending: false },
    { data: undefined, isPending: false, isError: true },
    {
      data: { token: TOKEN, cities: ["Austin"], blocked: true },
      isPending: false,
    },
  ]) {
    mocks.query = query;
    expect(card()).toMatchObject({
      description: "publicMap.settingOff",
      label: "publicMap.setUp",
      busy: "false",
    });
    cleanup();
  }
});

it("says how many cities a live page shows and offers Manage", () => {
  mocks.query = {
    data: { token: TOKEN, cities: ["Mexico City", "Austin"], blocked: false },
    isPending: false,
  };
  expect(card()).toMatchObject({
    description: "publicMap.settingOn:2",
    label: "publicMap.manage",
  });
  cleanup();
  mocks.query = {
    data: { token: TOKEN, cities: ["Austin"], blocked: false },
    isPending: false,
  };
  expect(card().description).toBe("publicMap.settingOn:1");
});

it("opens the sheet from Settings", () => {
  mocks.query = { data: null, isPending: false };
  fireEvent.click(card().button);
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/map-page",
    params: { from: "settings" },
  });
});
