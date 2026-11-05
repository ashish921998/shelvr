// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { RecentSaves } from "@/components/home/recent-saves";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/components/city/save-row", () => ({
  SaveRow: vi.fn(
    ({ item, onPress }: { item: { title?: string }; onPress: () => void }) => (
      <button onClick={onPress}>{item.title}</button>
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
  status: "ready",
  cities: ["Lisbon"],
  title: `Save ${id}`,
  imageUrl: null,
  ...overrides,
});

beforeEach(() => mocks.push.mockReset());

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
  expect(screen.getAllByRole("button")).toHaveLength(8);
  expect(screen.getByText("Save 7")).toBeTruthy();
  expect(screen.queryByText("Save 8")).toBeNull();
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
