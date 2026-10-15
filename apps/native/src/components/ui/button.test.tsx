// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const glass = vi.hoisted(() => ({ available: false }));

vi.mock("@/components/glass", () => ({
  get hasLiquidGlass() {
    return glass.available;
  },
  GlassView: vi.fn(
    ({ children, testID }: { children: ReactNode; testID?: string }) => (
      <div data-testid={testID}>{children}</div>
    ),
  ),
}));
vi.mock("react-native", () => ({
  Pressable: vi.fn(
    ({
      children,
      style,
    }: {
      children: ReactNode;
      style?: { opacity?: number }[];
    }) => (
      <button data-opacity={String(style?.[0]?.opacity)}>{children}</button>
    ),
  ),
  View: vi.fn(
    ({ children, testID }: { children: ReactNode; testID?: string }) => (
      <div data-testid={testID}>{children}</div>
    ),
  ),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/lib/motion", () => ({
  motion: { scale: { pressed: 0.97 }, duration: { feedback: 120 } },
  motionCSS: { out: {} },
}));
vi.mock("react-native-reanimated", () => ({
  default: { createAnimatedComponent: (component: unknown) => component },
  useReducedMotion: () => false,
}));
vi.mock("react-native-unistyles", () => {
  const theme = {
    gap: (v: number) => v * 8,
    opacity: { pressed: 0.7, disabled: 0.4 },
    control: { minHeight: 48, pressRetentionOffset: 12 },
    type: new Proxy({}, { get: () => ({}) }),
    colors: new Proxy({}, { get: () => "color" }),
  };
  return {
    useUnistyles: () => ({ theme }),
    StyleSheet: {
      hairlineWidth: 1,
      create: (factory: unknown) =>
        typeof factory === "function" ? factory(theme) : factory,
    },
  };
});

beforeEach(() => {
  vi.resetModules();
});

async function renderButton(props: { loading?: boolean } = {}) {
  const { Button } = await import("./button");
  render(<Button title="Continue" {...props} />);
}

it("renders interactive glass where Liquid Glass is available", async () => {
  glass.available = true;
  await renderButton();
  expect(screen.getByTestId("button-glass")).toBeTruthy();
  expect(screen.queryByTestId("button-solid")).toBeNull();
});

it("renders the solid capsule everywhere else", async () => {
  glass.available = false;
  await renderButton();
  expect(screen.getByTestId("button-solid")).toBeTruthy();
  expect(screen.queryByTestId("button-glass")).toBeNull();
});

it("dims a loading button without a spinner", async () => {
  glass.available = false;
  await renderButton({ loading: true });
  expect(screen.getByRole("button").getAttribute("data-opacity")).toBe("0.7");
  expect(screen.getByText("Continue")).toBeTruthy();
});
