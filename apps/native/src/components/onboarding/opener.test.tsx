// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

type Layout = { height: number; y: number };
type LayoutHandler = (event: { nativeEvent: { layout: Layout } }) => void;
type Style = { name?: string } | (Style | false | undefined)[] | undefined;

const screenState = vi.hoisted(() => ({
  fontScale: 1,
  layouts: new Map<string, LayoutHandler>(),
}));

function styleName(style: Style): string | undefined {
  if (Array.isArray(style)) {
    return style
      .map((part) => (part ? styleName(part) : undefined))
      .find(Boolean);
  }
  return style?.name;
}

function Box({
  children,
  style,
  onLayout,
}: {
  children?: ReactNode;
  style?: Style;
  onLayout?: LayoutHandler;
}) {
  const name = styleName(style);
  if (name && onLayout) screenState.layouts.set(name, onLayout);
  return <div data-testid={name}>{children}</div>;
}

vi.mock("react-native", () => ({
  View: Box,
  ScrollView: vi.fn(
    ({
      children,
      onLayout,
    }: {
      children?: ReactNode;
      onLayout?: LayoutHandler;
    }) => {
      if (onLayout) screenState.layouts.set("scroll", onLayout);
      return <div data-testid="scroll">{children}</div>;
    },
  ),
  Text: vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(({ children }: { children?: ReactNode }) => (
    <button>{children}</button>
  )),
  useWindowDimensions: () => ({
    fontScale: screenState.fontScale,
    width: 390,
    height: 844,
  }),
}));
vi.mock("react-native-unistyles", () => {
  const theme = {
    gap: (v: number) => v * 8,
    radius: { md: 12 },
    fonts: new Proxy({}, { get: () => "font" }),
    colors: new Proxy({}, { get: () => "#000000" }),
  };
  return {
    StyleSheet: {
      create: (factory: (t: typeof theme) => Record<string, object>) =>
        Object.fromEntries(
          Object.entries(factory(theme)).map(([name, value]) => [
            name,
            { ...value, name },
          ]),
        ),
    },
  };
});
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("@/lib/color", () => ({ withAlpha: (color: string) => color }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => undefined,
}));
vi.mock("@/components/onboarding/parts", () => ({
  CtaButton: vi.fn(({ label }: { label: string }) => <button>{label}</button>),
}));

function layout(name: string, value: Partial<Layout>) {
  const handler = screenState.layouts.get(name);
  if (!handler) throw new Error(`no onLayout for ${name}`);
  act(() =>
    handler({ nativeEvent: { layout: { height: 0, y: 0, ...value } } }),
  );
}

function footScrolls() {
  return screen
    .getByTestId("scroll")
    .contains(screen.getByText("onboarding.startYours"));
}

beforeEach(() => {
  screenState.fontScale = 1;
  screenState.layouts.clear();
});

async function renderOpener() {
  const { OpenerStep } = await import("./opener");
  const view = render(<OpenerStep onStart={() => {}} onSignIn={() => {}} />);
  return () =>
    view.rerender(<OpenerStep onStart={() => {}} onSignIn={() => {}} />);
}

it("pins the footer while it leaves room to read the content above", async () => {
  await renderOpener();
  layout("wrap", { height: 700 });
  layout("foot", { height: 200 });
  expect(footScrolls()).toBe(false);
});

it("scrolls the footer with the content when it takes most of the screen", async () => {
  await renderOpener();
  layout("wrap", { height: 700 });
  layout("foot", { height: 600 });
  expect(footScrolls()).toBe(true);
});

it("drops measurements from the old text size when the font scale changes", async () => {
  const rerender = await renderOpener();
  layout("wrap", { height: 700 });
  layout("foot", { height: 600 });
  expect(footScrolls()).toBe(true);

  screenState.fontScale = 1.5;
  rerender();

  // A fresh layout waits for new measurements instead of reusing the footer
  // height measured at the previous text size.
  expect(footScrolls()).toBe(false);
  layout("wrap", { height: 700 });
  layout("foot", { height: 650 });
  expect(footScrolls()).toBe(true);
});
