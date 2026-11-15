// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Id } from "@convex/_generated/dataModel";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { saveSource } from "@/lib/city-pins";
import { SaveRow } from "./save-row";

const themes = vi.hoisted(() => {
  const light = {
    colors: { foreground: "light-ink", keep: "green", onKeep: "deep-green" },
  };
  const dark = {
    colors: { foreground: "dark-ink", keep: "green", onKeep: "deep-green" },
  };
  const listeners = new Set<() => void>();
  let current = light;
  return {
    light,
    dark,
    listeners,
    current: () => current,
    use: (next: typeof light) => {
      current = next;
      for (const listener of listeners) listener();
    },
  };
});

vi.mock("react-native-unistyles", async () => {
  const { useLayoutEffect, useState } = await import("react");
  return {
    StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
    useUnistyles: () => {
      const [theme, setTheme] = useState(themes.current);
      const [reads] = useState(() => new Set<string | symbol>());
      const watched = new Proxy(theme, {
        get: (target, key) => {
          reads.add(key);
          return Reflect.get(target, key);
        },
      });
      useLayoutEffect(() => {
        if (reads.size === 0) return;
        const update = () => setTheme(themes.current());
        themes.listeners.add(update);
        return () => void themes.listeners.delete(update);
      });
      return { theme: watched, rt: {} };
    },
  };
});
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
      accessibilityValue,
      disabled,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
      accessibilityValue?: { text: string };
      disabled?: boolean;
    }) => (
      <button
        aria-label={accessibilityLabel}
        data-value={accessibilityValue?.text}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => <img alt="" />) }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/city-pins", () => ({
  saveSource: vi.fn(() => "example.com"),
}));
vi.mock("@/components/symbol", () => ({
  AppSymbolIcon: vi.fn(
    ({ name, tintColor }: { name: string; tintColor?: string }) => (
      <i data-symbol={name} data-tint={tintColor} />
    ),
  ),
}));

const save = {
  _id: "item-1" as Id<"items">,
  title: "Austin favorites",
  imageUrl: null,
};

function tint(container: HTMLElement, symbol: string) {
  return container
    .querySelector(`[data-symbol="${symbol}"]`)
    ?.getAttribute("data-tint");
}

beforeEach(() => {
  themes.listeners.clear();
  themes.use(themes.light);
  vi.mocked(saveSource).mockReturnValue("example.com");
});

it("names an unvisited place exactly, and a visited one as We went", () => {
  const toggle = vi.fn();
  const { rerender } = render(
    <SaveRow
      item={save}
      placeName="Jo's Coffee"
      emoji="☕"
      selected
      onToggleVisited={toggle}
    />,
  );
  expect(screen.getByRole("button", { name: "Jo's Coffee" })).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "cityProgress.markVisited" }),
  );
  expect(toggle).toHaveBeenCalledTimes(1);

  rerender(
    <SaveRow
      item={save}
      placeName="Jo's Coffee"
      emoji="☕"
      selected
      visited
      onToggleVisited={toggle}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Jo's Coffee, plan.weWent" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "cityProgress.unmarkVisited" }),
  ).toBeTruthy();
});

it("draws a row's buttons in the appearance picked before it is first selected", () => {
  const row = (selected: boolean) => (
    <SaveRow
      item={save}
      placeName="Jo's Coffee"
      emoji="☕"
      selected={selected}
      onToggleVisited={vi.fn()}
      onRemove={vi.fn()}
      onPlaceDetails={vi.fn()}
    />
  );
  const { container, rerender } = render(row(false));
  act(() => themes.use(themes.dark));
  rerender(row(true));

  expect(tint(container, "checkmark")).toBe("dark-ink");
  expect(tint(container, "minus")).toBe("dark-ink");
  expect(tint(container, "info.circle")).toBe("dark-ink");
});

it("shows the tally beside the source and reads it as the row's value", () => {
  render(
    <SaveRow
      item={save}
      placeName="Jo's Coffee"
      emoji="☕"
      onPress={vi.fn()}
      tally={{ picks: 1, passes: 0 }}
    />,
  );
  const tally = screen.getByText("✓ 1 · ✕ 0");
  expect(tally.parentElement).toBe(
    screen.getByText("Austin favorites").parentElement,
  );
  const row = screen.getByRole("button", { name: "Jo's Coffee" });
  expect(row.dataset.value).toBe("plan.tally");
});

it("shows a tally on a row with no source", () => {
  vi.mocked(saveSource).mockReturnValue("");
  render(
    <SaveRow
      item={{ _id: save._id, imageUrl: null }}
      placeName="Houndstooth Coffee"
      onPress={vi.fn()}
      tally={{ picks: 1, passes: 1 }}
    />,
  );
  expect(screen.getByText("✓ 1 · ✕ 1")).toBeTruthy();
});

it("has no tally and no value without votes", () => {
  render(<SaveRow item={save} placeName="Jo's Coffee" onPress={vi.fn()} />);
  expect(screen.queryByText(/✓/)).toBeNull();
  expect(screen.getByText("Austin favorites")).toBeTruthy();
  const row = screen.getByRole("button", { name: "Jo's Coffee" });
  expect(row.dataset.value).toBeUndefined();
});
