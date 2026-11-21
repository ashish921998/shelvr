// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { RecentSaves } from "@/components/home/recent-saves";

vi.mock("@/components/home/save-list-row", () => ({
  SaveListRow: vi.fn(
    ({ save }: { save: { title?: string; status: string } }) => (
      <button>{save.title ?? save.status}</button>
    ),
  ),
}));
vi.mock("@/components/home/section-heading", () => ({
  SectionHeading: vi.fn(({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  )),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  )),
}));
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
  overrides: Record<string, unknown> = {},
): Props["saves"][number] =>
  ({
    _id: id as Props["saves"][number]["_id"],
    _creationTime: new Date(2026, 10, 6, 9).getTime(),
    status: "ready",
    cities: ["Lisbon"],
    tags: [],
    title: `Save ${id}`,
    imageUrl: null,
    ...overrides,
  }) as unknown as Props["saves"][number];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 6, 15));
});
afterEach(() => vi.useRealTimers());

it("lists ready saves with a city and saves still being read", () => {
  render(
    <RecentSaves
      saves={[
        save("ok"),
        save("reading", { status: "processing", cities: undefined }),
        save("failed", { status: "failed" }),
        save("nocity", { cities: [] }),
        save("undefined", { cities: undefined }),
      ]}
    />,
  );
  expect(screen.getByText("Recents")).toBeTruthy();
  expect(
    screen.getAllByRole("button").map((button) => button.textContent),
  ).toEqual(["Save reading", "Save ok"]);
});

it("puts saves still being read first under Today", () => {
  render(
    <RecentSaves
      saves={[
        save("ready"),
        save("reading", { status: "processing", cities: undefined }),
      ]}
    />,
  );
  expect(
    screen.getAllByRole("button").map((button) => button.textContent),
  ).toEqual(["Save reading", "Save ready"]);
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

it("puts each save under the day it was saved", () => {
  render(
    <RecentSaves
      saves={[
        save("today"),
        save("yesterday", {
          _creationTime: new Date(2026, 10, 5, 22).getTime(),
        }),
      ]}
    />,
  );
  expect(
    screen.getAllByRole("heading").map((title) => title.textContent),
  ).toEqual(["Recents", "Today", "Yesterday"]);
});
