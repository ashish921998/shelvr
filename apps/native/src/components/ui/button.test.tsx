// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
      disabled,
      accessibilityState,
    }: {
      children: ReactNode;
      style?: { opacity?: number }[];
      disabled?: boolean;
      accessibilityState?: { disabled?: boolean; busy?: boolean };
    }) => (
      <button
        data-opacity={String(style?.[0]?.opacity)}
        data-pressable-disabled={String(!!disabled)}
        aria-disabled={accessibilityState?.disabled ? "true" : "false"}
        aria-busy={accessibilityState?.busy ? "true" : "false"}
      >
        {children}
      </button>
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

async function renderButton(
  props: { loading?: boolean; disabled?: boolean } = {},
) {
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

it("tells VoiceOver and TalkBack a disabled button is disabled, glass or solid", async () => {
  for (const available of [true, false]) {
    glass.available = available;
    await renderButton({ disabled: true });
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("data-pressable-disabled")).toBe("true");
    expect(button.getAttribute("data-opacity")).toBe("0.4");
    cleanup();
  }
});
