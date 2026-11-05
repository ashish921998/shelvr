// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { RecentSaves } from "@/components/home/recent-saves";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/components/city/save-row", () => ({
  SaveRow: vi.fn(
    ({
      item,
      detail,
      onPress,
    }: {
      item: { title?: string };
      detail?: string;
      onPress: () => void;
    }) => (
      <>
        <button onClick={onPress}>{item.title}</button>
        <small>{detail}</small>
      </>
    ),
  ),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  )),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
}));

type Props = Parameters<typeof RecentSaves>[0];
const save = (
  id: string,
  overrides: Partial<Props["saves"][number]> = {},
): Props["saves"][number] => ({
  _id: id as Props["saves"][number]["_id"],
  _creationTime: new Date(2026, 10, 6, 9).getTime(),
  status: "ready",
  cities: ["Lisbon"],
  tags: [],
  title: `Save ${id}`,
  imageUrl: null,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 6, 15));
  mocks.push.mockReset();
});
afterEach(() => vi.useRealTimers());

it("lists only ready saves that have a city", () => {
  render(
    <RecentSaves
      saves={[
        save("ok"),
        save("reading", { status: "processing" }),
        save("failed", { status: "failed" }),
        save("nocity", { cities: [] }),
        save("undefined", { cities: undefined }),
      ]}
    />,
  );
  expect(screen.getByText("Recent saves")).toBeTruthy();
  expect(screen.getByText("Save ok")).toBeTruthy();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

it("shows at most eight, keeping the first eight in order", () => {
  render(
    <RecentSaves
      saves={Array.from({ length: 10 }, (_, i) => save(String(i)))}
    />,
  );
  expect(
    screen.getAllByRole("button").map((button) => button.textContent),
  ).toEqual(Array.from({ length: 8 }, (_, i) => `Save ${i}`));
});

it("renders nothing when no save qualifies", () => {
  const { container } = render(
    <RecentSaves saves={[save("a", { cities: [] })]} />,
  );
  expect(container.textContent).toBe("");
});

it("opens a save from Home", () => {
  render(<RecentSaves saves={[save("abc")]} />);
  fireEvent.click(screen.getByText("Save abc"));
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/item/[id]",
    params: { id: "abc", from: "home" },
  });
});

it("puts each save under the day it was saved, with its kind and city", () => {
  render(
    <RecentSaves
      saves={[
        save("today", { tags: ["coffee"] }),
        save("yesterday", {
          _creationTime: new Date(2026, 10, 5, 22).getTime(),
        }),
      ]}
    />,
  );
  expect(
    screen.getAllByRole("heading").map((title) => title.textContent),
  ).toEqual(["Recent saves", "Today", "Yesterday"]);
  expect(screen.getByText("Coffee · Lisbon")).toBeTruthy();
  expect(screen.getByText("Lisbon")).toBeTruthy();
});
