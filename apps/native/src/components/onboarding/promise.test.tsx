// @vitest-environment jsdom
// The promise step: names the reminder only when one was scheduled, and its
// one button hands over to the paywall.
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PromiseStep } from "./promise";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  button: ({
    label,
    onPress,
    busy,
  }: {
    label: string;
    onPress: () => void;
    busy?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={busy}>
      {label}
    </button>
  ),
}));

const item = vi.hoisted(() => ({
  data: undefined as { heroImageUrl?: string; imageUrl?: string } | undefined,
}));

vi.mock("react-native", () => ({ View: mock.view, Text: mock.text }));
vi.mock("expo-image", () => ({
  Image: vi.fn(({ source }: { source: string }) => <img alt="" src={source} />),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { getItem: "items.getItem" } },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_ref: unknown, args: unknown) => ({ args }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ args }: { args: unknown }) => ({
    data: args === "skip" ? undefined : item.data,
  }),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: Record<string, string>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("@/components/onboarding/parts", () => ({ CtaButton: mock.button }));

const base = { saved: null, spaces: [] as string[], leaving: false };
const firstSave = {
  itemId: "item1" as never,
  savedSpaceNames: ["Recipes"],
};

describe("PromiseStep", () => {
  it("names the reminder that was scheduled", () => {
    render(<PromiseStep {...base} reminder="weekend" onCommit={vi.fn()} />);
    expect(screen.getByText("promise.reminderWeekend")).toBeTruthy();
    expect(screen.queryByText("promise.comeBack")).toBeNull();
    expect(screen.getByText("promise.share")).toBeTruthy();
    expect(screen.getByText("promise.use")).toBeTruthy();
  });

  it("promises to come back when no reminder was set", () => {
    render(<PromiseStep {...base} reminder={null} onCommit={vi.fn()} />);
    expect(screen.getByText("promise.comeBack")).toBeTruthy();
  });

  it("commits with one tap", () => {
    const onCommit = vi.fn();
    render(<PromiseStep {...base} reminder={null} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("promise.cta"));
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("takes no taps while the paywall is on its way", () => {
    const onCommit = vi.fn();
    render(
      <PromiseStep {...base} reminder={null} leaving onCommit={onCommit} />,
    );
    fireEvent.click(screen.getByText("promise.cta"));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("names the space the first save went to, with its picture", () => {
    item.data = { heroImageUrl: "https://example.com/hero.jpg" };
    const { container } = render(
      <PromiseStep
        {...base}
        saved={firstSave}
        spaces={["Recipes"]}
        reminder={null}
        onCommit={vi.fn()}
      />,
    );
    expect(
      screen.getByText('promise.firstSaveIn:{"space":"Recipes"}'),
    ).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/hero.jpg",
    );
    expect(screen.queryByText("promise.body")).toBeNull();
  });

  it("says the first save is on the shelf when it went to no space", () => {
    item.data = undefined;
    const { container } = render(
      <PromiseStep
        {...base}
        saved={{ ...firstSave, savedSpaceNames: [] }}
        reminder={null}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText("promise.firstSaveSaved")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("says the spaces are picked when there is no first save", () => {
    render(
      <PromiseStep
        {...base}
        spaces={["Recipes"]}
        reminder={null}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText("promise.spacesPicked")).toBeTruthy();
  });

  it("keeps the old line with neither a save nor spaces", () => {
    render(<PromiseStep {...base} reminder={null} onCommit={vi.fn()} />);
    expect(screen.getByText("promise.body")).toBeTruthy();
  });
});
