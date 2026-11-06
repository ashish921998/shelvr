// @vitest-environment jsdom
import { Fragment, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AllSaves } from "@/components/home/all-saves";

type Save = {
  _id: string;
  _creationTime: number;
  status: "processing" | "ready" | "failed";
  cities?: string[];
  tags: string[];
  title?: string;
  imageUrl: string | null;
};

const mocks = vi.hoisted(() => ({
  loadMore: vi.fn(),
  items: undefined as Save[] | undefined,
}));

vi.mock("@/components/home/save-list-row", () => ({
  SaveListRow: vi.fn(({ save }: { save: Save }) => (
    <button>{save.title}</button>
  )),
}));
vi.mock("@/components/screen-title", () => ({
  ScreenTitle: vi.fn(({ title }: { title: string }) => <h1>{title}</h1>),
}));
vi.mock("@/components/home/home-places", () => ({
  HomePlacesEmptyCard: vi.fn(() => <p>Add your first spot</p>),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(({ label }: { label: string }) => <p>{label}</p>),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  )),
}));
vi.mock("@/lib/home-feed", () => ({
  useHomeFeed: () => ({ items: mocks.items, loadMore: mocks.loadMore }),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  SectionList: vi.fn(
    ({
      sections,
      keyExtractor,
      ListHeaderComponent: header,
      ListEmptyComponent: empty,
      renderSectionHeader,
      renderItem,
      onEndReached,
    }: {
      sections: { key: string; data: Save[] }[];
      keyExtractor: (save: Save) => string;
      ListHeaderComponent: ReactNode;
      ListEmptyComponent: ReactNode;
      renderSectionHeader: (info: { section: unknown }) => ReactNode;
      renderItem: (info: { item: Save }) => ReactNode;
      onEndReached: () => void;
    }) => (
      <div>
        {header}
        {sections.length === 0 ? empty : null}
        {sections.map((section) => (
          <section key={section.key}>
            {renderSectionHeader({ section })}
            {section.data.map((save) => (
              <Fragment key={keyExtractor(save)}>
                {renderItem({ item: save })}
              </Fragment>
            ))}
          </section>
        ))}
        <button onClick={onEndReached}>end of list</button>
      </div>
    ),
  ),
}));

const at = (day: number, hour: number) =>
  new Date(2026, 10, day, hour).getTime();
const save = (id: string, overrides: Partial<Save> = {}): Save => ({
  _id: id,
  _creationTime: at(6, 9),
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
  mocks.loadMore.mockReset();
  mocks.items = undefined;
});
afterEach(() => vi.useRealTimers());

it("waits for the first page of saves", () => {
  render(<AllSaves />);
  expect(screen.getByText("Warming your shelf")).toBeTruthy();
});

it("lists every save under the day it was saved, placeless ones too", () => {
  mocks.items = [
    save("coffee", { tags: ["coffee"] }),
    save("reading", { status: "processing", cities: undefined }),
    save("failed", {
      status: "failed",
      cities: undefined,
      _creationTime: at(5, 20),
    }),
    save("noplace", { cities: [], _creationTime: at(2, 8) }),
  ];
  render(<AllSaves />);
  expect(
    screen.getAllByRole("heading").map((title) => title.textContent),
  ).toEqual(["All saves", "Today", "Yesterday", "Mon, Nov 2"]);
  expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual([
    "Save reading",
    "Save coffee",
    "Save failed",
    "Save noplace",
    "end of list",
  ]);
});

it("loads the next page at the end of the list", () => {
  mocks.items = [save("a")];
  render(<AllSaves />);
  fireEvent.click(screen.getByText("end of list"));
  expect(mocks.loadMore).toHaveBeenCalled();
});

it("offers the first save when the account has none", () => {
  mocks.items = [];
  render(<AllSaves />);
  expect(screen.getByText("Add your first spot")).toBeTruthy();
  expect(
    screen.getAllByRole("heading").map((title) => title.textContent),
  ).toEqual(["All saves"]);
});
